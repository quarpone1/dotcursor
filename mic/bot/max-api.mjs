// Тонкий клиент Bot API MAX. Всё, что нужно боту: получать события,
// отвечать, рисовать кнопки и управлять подписками на вебхук.
const BASE = process.env.MAX_API_BASE || 'https://botapi.max.ru';
const DEBUG = process.env.MAX_DEBUG === '1';

export class MaxApi {
  constructor(token, base = BASE) {
    if (!token) throw new Error('MaxApi: нужен токен бота');
    this.token = token;
    this.base = base;
  }

  async call(method, path, { params = {}, body } = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this.token,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
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

  /** Сообщение пользователю или в чат. */
  send({ userId, chatId, text, buttons }) {
    return this.call('POST', '/messages', {
      params: { user_id: userId, chat_id: chatId },
      body: { text, attachments: MaxApi.keyboard(buttons) },
    });
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

function nameFromType(type) {
  return { image: 'изображение', video: 'видео', audio: 'аудио', file: 'файл' }[type] || 'вложение';
}
