// Форма заявки в техподдержку МИС.
// Отдаёт статику и выдаёт браузеру одноразовые ссылки на загрузку в Яндекс.Диск.
// Сами файлы через этот процесс не идут: браузер делает PUT прямо на uploader Яндекса.
import { createServer } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendTicketMail, collectAttachments, verifyMail, mailConfigured } from './mailer.mjs';
import { ticketNumber, priorityOf, ticketText } from './ticket.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3210);
const TOKEN = process.env.YANDEX_DISK_TOKEN;
const DISK_ROOT = (process.env.DISK_ROOT || 'disk:/МИС-заявки').replace(/\/+$/, '');
const MAX_FILES = Number(process.env.MAX_FILES || 10);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB || 100) * 1024 * 1024;
const LOG_DIR = process.env.LOG_DIR || join(ROOT, 'data');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_PER_HOUR = Number(process.env.RATE_PER_HOUR || 20);

if (!TOKEN) {
  console.error('YANDEX_DISK_TOKEN не задан — загрузка файлов работать не будет. См. README.md');
  process.exit(1);
}

/* ---------- Яндекс.Диск REST ---------- */

const API = 'https://cloud-api.yandex.net/v1/disk';

async function yd(method, endpoint, params = {}, body) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON — оставляем null */ }
  return { status: res.status, ok: res.ok, json, text };
}

// Диск не создаёт промежуточные папки сам — идём по сегментам.
async function ensureDir(path) {
  const rest = path.replace(/^disk:\//, '');
  const segments = rest.split('/').filter(Boolean);
  let current = 'disk:';
  for (const seg of segments) {
    current += '/' + seg;
    const r = await yd('PUT', '/resources', { path: current });
    // 409 = уже существует, это нормальный путь
    if (!r.ok && r.status !== 409) {
      throw new Error(`Яндекс.Диск: не удалось создать ${current} (${r.status} ${r.text.slice(0, 200)})`);
    }
  }
}

async function uploadHref(path) {
  const r = await yd('GET', '/resources/upload', { path, overwrite: 'true' });
  if (!r.ok || !r.json?.href) {
    throw new Error(`Яндекс.Диск: нет ссылки на загрузку (${r.status} ${r.text.slice(0, 200)})`);
  }
  return r.json.href;
}

async function uploadText(path, content) {
  const href = await uploadHref(path);
  const res = await fetch(href, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
  });
  if (!res.ok) throw new Error(`Яндекс.Диск: не удалось записать ${path} (${res.status})`);
}

async function resourceMeta(path) {
  const r = await yd('GET', '/resources', { path, fields: 'size,name,path' });
  return r.ok ? r.json : null;
}

async function removeResource(path) {
  await yd('DELETE', '/resources', { path, permanently: 'true' });
}

// Публикуем папку заявки, чтобы инженер открыл вложения прямо из Planfix.
async function publishFolder(path) {
  if (process.env.PUBLISH_FOLDER === 'false') return null;
  const pub = await yd('PUT', '/resources/publish', { path });
  if (!pub.ok && pub.status !== 409) return null;
  const meta = await yd('GET', '/resources', { path, fields: 'public_url' });
  return meta.ok ? meta.json?.public_url || null : null;
}

// Стримим тело запроса прямо в uploader Яндекса: память не растёт даже на 100 МБ.
function pipeToUploader(req, href, contentLength) {
  return new Promise((resolve, reject) => {
    const target = new URL(href);
    const transport = target.protocol === 'http:' ? http : https;
    const upstream = transport.request(target, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(contentLength ? { 'Content-Length': String(contentLength) } : {}),
      },
    });
    upstream.on('response', (up) => {
      up.resume();
      up.on('end', () => resolve(up.statusCode));
    });
    upstream.on('error', reject);
    req.on('error', () => upstream.destroy());
    req.pipe(upstream);
  });
}

async function downloadHref(path) {
  const r = await yd('GET', '/resources/download', { path });
  return r.ok ? r.json?.href || null : null;
}

/* ---------- Сессии ---------- */

const sessions = new Map();
const rate = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  for (const [ip, hits] of rate) {
    const fresh = hits.filter((t) => now - t < 3600_000);
    if (fresh.length) rate.set(ip, fresh); else rate.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function rateOk(ip) {
  const now = Date.now();
  const hits = (rate.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= RATE_PER_HOUR) { rate.set(ip, hits); return false; }
  hits.push(now);
  rate.set(ip, hits);
  return true;
}

function folderFor(ticketNo) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${DISK_ROOT}/${stamp} ${ticketNo}`;
}

async function newSession(ip) {
  const ticketNo = ticketNumber();
  const folder = folderFor(ticketNo);
  await ensureDir(folder);
  const id = randomUUID();
  sessions.set(id, { id, ticketNo, folder, files: [], createdAt: Date.now(), ip, submitted: false });
  return sessions.get(id);
}

function safeName(name, index) {
  const cleaned = String(name || 'файл')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'файл';
  return `${String(index).padStart(2, '0')}_${cleaned}`;
}

/* ---------- HTTP ---------- */

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}

async function readJson(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['public/index.html', 'text/html; charset=utf-8'],
  '/favicon.ico': [null, null],
};

const str = (v, max = 4000) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

const routes = {
  // Сессию заводим одним запросом до первой загрузки, иначе параллельные
  // файлы создали бы каждый свою заявку и свою папку.
  'POST /api/session': async (req, res) => {
    const ip = clientIp(req);
    if (!rateOk(ip)) return send(res, 429, { error: 'Слишком много заявок с этого адреса. Попробуйте позже.' });
    const session = await newSession(ip);
    send(res, 200, { sessionId: session.id, ticketNo: session.ticketNo });
  },

  // Браузер просит ссылку на загрузку одного файла.
  'POST /api/upload-url': async (req, res) => {
    const ip = clientIp(req);
    const body = await readJson(req);
    const size = Number(body.size);
    const name = str(body.name, 300);

    if (!Number.isFinite(size) || size <= 0) return send(res, 400, { error: 'Неверный размер файла' });
    if (size > MAX_FILE_BYTES) {
      return send(res, 413, { error: `Файл больше ${MAX_FILE_BYTES / 1048576} МБ` });
    }

    let session = sessions.get(str(body.sessionId, 64));
    if (!session) {
      if (!rateOk(ip)) return send(res, 429, { error: 'Слишком много заявок с этого адреса. Попробуйте позже.' });
      session = await newSession(ip);
    }
    if (session.submitted) return send(res, 409, { error: 'Заявка уже отправлена' });
    if (session.files.filter((f) => !f.removed).length >= MAX_FILES) {
      return send(res, 400, { error: `Не больше ${MAX_FILES} файлов` });
    }

    // Номер и место в списке занимаем СИНХРОННО, до любого await: иначе два
    // параллельных файла получат один и тот же префикс и затрут друг друга.
    session.seq = (session.seq || 0) + 1;
    const diskName = safeName(name, session.seq);
    const path = `${session.folder}/${diskName}`;

    const file = { id: randomUUID(), name, diskName, path, size, href: null, uploaded: false, removed: false };
    session.files.push(file);

    try {
      file.href = await uploadHref(path);
    } catch (err) {
      file.removed = true;          // не держим занятый слот, если Диск не ответил
      throw err;
    }

    send(res, 200, {
      sessionId: session.id,
      ticketNo: session.ticketNo,
      fileId: file.id,
      href: file.href,
      maxFiles: MAX_FILES,
    });
  },

  // Резервный канал: если браузеру запретили кросс-доменный PUT на uploader Яндекса,
  // файл идёт через нас — потоком, без буферизации в память.
  'PUT /api/upload-proxy': async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const session = sessions.get(str(url.searchParams.get('sessionId'), 64));
    if (!session) return send(res, 404, { error: 'Сессия не найдена' });
    const file = session.files.find((f) => f.id === url.searchParams.get('fileId') && !f.removed);
    if (!file) return send(res, 404, { error: 'Файл не найден' });

    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_FILE_BYTES) return send(res, 413, { error: `Файл больше ${MAX_FILE_BYTES / 1048576} МБ` });

    try {
      const status = await pipeToUploader(req, file.href, len);
      if (status >= 200 && status < 300) return send(res, 200, { ok: true });
      return send(res, status === 413 || status === 507 ? status : 502,
        { error: `Хранилище отклонило файл (${status})` });
    } catch (err) {
      return send(res, 502, { error: 'Не удалось передать файл в хранилище' });
    }
  },

  // Браузер сообщает, что PUT прошёл. Сверяем реальный размер на Диске.
  'POST /api/upload-done': async (req, res) => {
    const body = await readJson(req);
    const session = sessions.get(str(body.sessionId, 64));
    if (!session) return send(res, 404, { error: 'Сессия не найдена' });
    const file = session.files.find((f) => f.id === body.fileId);
    if (!file) return send(res, 404, { error: 'Файл не найден' });

    const meta = await resourceMeta(file.path);
    if (!meta) return send(res, 502, { error: 'Файл не появился на Диске' });
    if (Number(meta.size) > MAX_FILE_BYTES) {
      await removeResource(file.path);
      file.removed = true;
      return send(res, 413, { error: `Файл больше ${MAX_FILE_BYTES / 1048576} МБ` });
    }
    file.uploaded = true;
    file.size = Number(meta.size);
    send(res, 200, { ok: true, size: file.size });
  },

  'POST /api/remove-file': async (req, res) => {
    const body = await readJson(req);
    const session = sessions.get(str(body.sessionId, 64));
    if (!session) return send(res, 404, { error: 'Сессия не найдена' });
    const file = session.files.find((f) => f.id === body.fileId);
    if (!file) return send(res, 404, { error: 'Файл не найден' });
    if (file.uploaded) await removeResource(file.path).catch(() => {});
    file.removed = true;
    file.uploaded = false;
    send(res, 200, { ok: true });
  },

  'POST /api/ticket': async (req, res) => {
    const ip = clientIp(req);
    const body = await readJson(req);

    const f = {
      clinic: str(body.clinic, 200),
      module: str(body.module, 200),
      user: str(body.user, 300),
      patient: str(body.patient, 200),
      title: str(body.title, 500),
      steps: str(body.steps, 5000),
      fact: str(body.fact, 3000),
      expect: str(body.expect, 3000),
      urgency: str(body.urgency, 200),
      contact: str(body.contact, 300),
    };
    const missing = ['clinic', 'module', 'user', 'title', 'steps', 'fact', 'expect', 'urgency', 'contact']
      .filter((k) => !f[k]);
    if (missing.length) return send(res, 400, { error: 'Заполнены не все обязательные поля', missing });

    let session = sessions.get(str(body.sessionId, 64));
    if (!session) {
      if (!rateOk(ip)) return send(res, 429, { error: 'Слишком много заявок с этого адреса. Попробуйте позже.' });
      session = await newSession(ip);
    }
    if (session.submitted) return send(res, 409, { error: 'Заявка уже отправлена', ticketNo: session.ticketNo });

    const uploaded = session.files.filter((x) => x.uploaded);
    const pr = priorityOf(f.urgency);
    const text = ticketText({
      ticketNo: session.ticketNo,
      fields: f,
      files: uploaded.map((x) => ({ name: x.diskName, size: x.size })),
      folder: session.folder,
      source: 'веб-форма',
    });

    await uploadText(`${session.folder}/заявка.txt`, text);
    session.submitted = true;

    const publicUrl = uploaded.length ? await publishFolder(session.folder).catch(() => null) : null;

    // Письмо в Planfix — заявка считается принятой, даже если почта отвалилась:
    // текст и файлы уже лежат на Диске, оператору покажем предупреждение.
    let mailed = false;
    let mailError = null;
    try {
      const attachments = await collectAttachments(uploaded, downloadHref);
      await sendTicketMail({
        ticketNo: session.ticketNo,
        priority: pr[0],
        sla: pr[1],
        fields: f,
        text,
        folder: session.folder,
        publicUrl,
        attachments,
      });
      mailed = true;
    } catch (err) {
      mailError = err.message;
      console.error(`Письмо по ${session.ticketNo} не ушло:`, err.message);
    }

    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(
      join(LOG_DIR, 'tickets.jsonl'),
      JSON.stringify({
        ts: new Date().toISOString(),
        ticketNo: session.ticketNo,
        folder: session.folder,
        publicUrl,
        mailed,
        mailError,
        ip,
        fields: f,
        files: uploaded.map((x) => ({ name: x.diskName, size: x.size })),
      }) + '\n',
      'utf8',
    );

    send(res, 200, {
      ticketNo: session.ticketNo,
      priority: pr[0],
      sla: pr[1],
      text,
      folder: session.folder,
      publicUrl,
      mailed,
      warning: mailed ? null : 'Заявка сохранена, но письмо в Planfix не ушло. Скопируйте текст заявки и продублируйте вручную.',
    });
  },

  // Дёргает браузер при открытии формы — держим дешёвым.
  'GET /api/limits': async (_req, res) => {
    send(res, 200, { maxFiles: MAX_FILES, maxFileMb: MAX_FILE_BYTES / 1048576 });
  },

  // Для мониторинга: проверяет и Диск, и SMTP.
  'GET /api/health': async (_req, res) => {
    const r = await yd('GET', '/', {});
    const mail = await verifyMail();
    send(res, r.ok && mail.ok ? 200 : 502, {
      ok: r.ok && mail.ok,
      disk: r.ok ? { used: r.json?.used_space, total: r.json?.total_space } : r.status,
      mail: { ok: mail.ok, error: mail.error || null },
      maxFiles: MAX_FILES,
      maxFileMb: MAX_FILE_BYTES / 1048576,
    });
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;

  try {
    if (routes[key]) return await routes[key](req, res);

    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      if (!file) return send(res, 204, '');
      const buf = await readFile(join(ROOT, file));
      return send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(key, err);
    const msg = /too large/.test(err.message) ? 'Слишком большой запрос' : 'Внутренняя ошибка сервера';
    send(res, 500, { error: msg });
  }
});

if (!mailConfigured) {
  console.warn('SMTP_USER / SMTP_PASS не заданы — заявки будут сохраняться на Диск, но письма в Planfix не уйдут.');
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Форма МИС слушает http://127.0.0.1:${PORT} · папка ${DISK_ROOT} · ${MAX_FILES}×${MAX_FILE_BYTES / 1048576} МБ`);
});
