// Тонкий клиент Bot API MAX. Всё, что нужно боту: получать события,
// отвечать, рисовать кнопки и управлять подписками на вебхук.
import { trustMaxCa, explainNetError } from './max-tls.mjs';

// С 19 июля 2026 API живёт только на platform-api2.max.ru — с сертификатом Минцифры.
export const MAX_API_BASE = process.env.MAX_API_BASE || 'https://platform-api2.max.ru';
const BASE = MAX_API_BASE;
const DEBUG = process.env.MAX_DEBUG === '1';

trustMaxCa();

/** fetch, у которого сетевая ошибка объясняет, что чинить (сертификат, старый домен). */
export async function maxFetch(url, init, base = BASE) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const hint = explainNetError(e, base);
    if (!hint) throw e;
    throw new Error(`MAX API: ${hint}`, { cause: e });
  }
}

export class MaxApi {
  constructor(token, base = BASE) {
    if (!token) throw new Error('MaxApi: нужен токен бота');
    this.token = token;
    this.base = base;
  }

  async call(method, path, { params = {}, body } = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    const res = await maxFetch(url, {
      method,
      headers: {
        Authorization: this.token,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }, this.base);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
    if (DEBUG) console.log(`[max] ${method} ${path} → ${res.status}`, text.slice(0, 300));
    if (!res.ok) {
      const err = new Error(`MAX API ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  me() { return this.call('GET', '/me'); }

  /** Длинный опрос. Возвращает {updates, marker}. */
  updates({ marker, timeout = 30, limit = 100 } = {}) {
    return this.call('GET', '/updates', { params: { marker, timeout, limit } });
  }

  /** Кнопки нашего формата → вложение inline_keyboard. */
  static keyboard(rows) {
    if (!rows?.length) return [];
    const buttons = rows
      .map((row) => row.map((b) => ({ type: 'callback', text: b.text, payload: b.payload })))
      .filter((row) => row.length);
    return buttons.length ? [{ type: 'inline_keyboard', payload: { buttons } }] : [];
  }

  /**
   * Сообщение пользователю или в чат. `attachments` — готовые вложения (файлы, картинки).
   * `format` — 'html' или 'markdown', без него текст уходит как есть.
   */
  send({ userId, chatId, text, format, buttons, attachments = [] }) {
    return this.call('POST', '/messages', {
      params: { user_id: userId, chat_id: chatId },
      body: {
        text,
        ...(format ? { format } : {}),
        attachments: [...attachments, ...MaxApi.keyboard(buttons)],
      },
    });
  }

  /** Групповые чаты и каналы, где состоит бот. Личных диалогов здесь нет. */
  chats({ count = 100, marker } = {}) {
    return this.call('GET', '/chats', { params: { count, marker } });
  }

  /**
   * Загружает файл в MAX и возвращает вложение для send().
   * Картинки идут как image (MAX покажет превью), остальное — как file.
   * Проверено живым токеном: POST /uploads → url, multipart «data» → token.
   */
  async upload(buffer, filename) {
    const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename || '');
    const type = isImage ? 'image' : 'file';
    const { url } = await this.call('POST', '/uploads', { params: { type } });
    const fd = new FormData();
    fd.append('data', new Blob([buffer]), filename || 'файл');
    const res = await maxFetch(url, { method: 'POST', body: fd, signal: AbortSignal.timeout(120_000) }, url);
    const text = await res.text();
    if (!res.ok) throw new Error(`MAX upload ${type}: ${res.status} ${text.slice(0, 150)}`);
    const j = JSON.parse(text);
    if (type === 'image') {
      const first = Object.values(j.photos || {})[0];
      if (!first?.token) throw new Error('MAX upload image: нет токена в ответе');
      return { type: 'image', payload: { token: first.token } };
    }
    if (!j.token) throw new Error('MAX upload file: нет токена в ответе');
    return { type: 'file', payload: { token: j.token } };
  }

  /** Ответ на нажатие кнопки: гасит «часики» и может подменить сообщение. */
  answerCallback(callbackId, { text, buttons } = {}) {
    const body = {};
    if (text !== undefined) body.message = { text, attachments: MaxApi.keyboard(buttons) };
    return this.call('POST', '/answers', { params: { callback_id: callbackId }, body });
  }

  subscriptions() { return this.call('GET', '/subscriptions'); }
  subscribe(url, updateTypes) {
    return this.call('POST', '/subscriptions', {
      body: { url, ...(updateTypes ? { update_types: updateTypes } : {}) },
    });
  }
  unsubscribe(url) { return this.call('DELETE', '/subscriptions', { params: { url } }); }
}

/* ---------- разбор событий ----------
   Формы полей в разных типах событий отличаются, поэтому достаём
   их терпимо к вариациям: лучше понять событие, чем упасть на поле. */

export function parseUpdate(u) {
  const type = u?.update_type || u?.updateType;
  const msg = u?.message;

  const userId =
    u?.callback?.user?.user_id ?? msg?.sender?.user_id ?? u?.user?.user_id ?? u?.user_id ?? null;
  const chatId =
    msg?.recipient?.chat_id ?? u?.chat_id ?? u?.chatId ?? null;
  const userName =
    u?.callback?.user?.name ?? msg?.sender?.name ?? u?.user?.name ?? null;

  if (type === 'message_callback') {
    return {
      kind: 'callback',
      userId, chatId, userName,
      callbackId: u.callback?.callback_id ?? u.callback?.callbackId ?? null,
      payload: u.callback?.payload ?? '',
      raw: u,
    };
  }

  if (type === 'message_created') {
    const body = msg?.body || {};
    const attachments = (body.attachments || []).map(parseAttachment).filter(Boolean);
    return {
      kind: attachments.length ? 'attachment' : 'text',
      userId, chatId, userName,
      text: body.text || '',
      attachments,
      raw: u,
    };
  }

  if (type === 'bot_started' || type === 'bot_added') {
    return { kind: 'start', userId, chatId, userName, raw: u };
  }

  return { kind: 'other', type, userId, chatId, userName, raw: u };
}

function parseAttachment(a) {
  if (!a?.type) return null;
  const p = a.payload || {};
  return {
    type: a.type,                                   // image | video | audio | file | ...
    name: p.filename || p.name || a.filename || nameFromType(a.type),
    size: Number(p.size || a.size || 0),
    url: p.url || p.token || null,
    fileId: p.fileId ?? p.file_id ?? null,
  };
}

/**
 * MAX отдаёт фото и голосовые без имени — «изображение», «аудио». Без расширения
 * Planfix и YouTrack не показывают превью. Расширение берём из Content-Type,
 * а если он невнятный (octet-stream) — по сигнатуре файла.
 */
export function withExtension(name, contentType, buf) {
  name = String(name || 'файл').trim() || 'файл';
  if (/\.[a-z0-9]{1,5}$/i.test(name)) return name;
  const byType = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
    'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt',
  };
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  let ext = byType[ct];
  if (!ext && buf?.length >= 12) {
    const h = buf.subarray(0, 12).toString('hex');
    const s8 = buf.subarray(0, 8).toString('latin1');
    if (h.startsWith('ffd8ff')) ext = 'jpg';
    else if (h.startsWith('89504e47')) ext = 'png';
    else if (h.startsWith('47494638')) ext = 'gif';
    else if (h.startsWith('52494646') && buf.subarray(8, 12).toString('latin1') === 'WEBP') ext = 'webp';
    else if (h.startsWith('25504446')) ext = 'pdf';
    else if (buf.subarray(4, 8).toString('latin1') === 'ftyp') ext = /^ftypqt/.test(buf.subarray(4, 10).toString('latin1')) ? 'mov' : 'mp4';
    else if (h.startsWith('4f676753')) ext = 'ogg';
    else if (h.startsWith('494433') || h.startsWith('fffb') || h.startsWith('fff3')) ext = 'mp3';
    else if (s8.startsWith('PK')) ext = 'zip';
  }
  return ext ? `${name}.${ext}` : name;
}

/** Одинаковые имена («изображение.jpg» ×3) нумерует, чтобы файлы не слипались. */
export function uniqueNames(files) {
  const seen = new Map();
  for (const f of files) {
    const n = seen.get(f.name) || 0;
    seen.set(f.name, n + 1);
    if (n) f.name = f.name.replace(/(\.[a-z0-9]{1,5})?$/i, ` (${n + 1})$1`);
  }
  return files;
}

function nameFromType(type) {
  return { image: 'изображение', video: 'видео', audio: 'аудио', file: 'файл' }[type] || 'вложение';
}
