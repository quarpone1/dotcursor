// Подменяет fetch к Яндекс.Диску локальной эмуляцией, чтобы прогнать весь путь
// формы без настоящего токена. Подключается через --import.
// Одноразовые ссылки на загрузку обслуживает реальный http-сервер на UPLOADER_PORT,
// поэтому браузер/тест ходит по ним обычным PUT — как к настоящему uploader'у Яндекса.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const UPLOADER_PORT = Number(process.env.MOCK_UPLOADER_PORT || 3398);

const dirs = new Set(['disk:']);
const files = new Map();         // path -> Buffer
const tokens = new Map();        // token -> path

const realFetch = globalThis.fetch;
const toUrl = (input) =>
  input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/* --- эмуляция uploader'а --- */
const CORS = process.env.MOCK_CORS === '1'
  ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, GET, OPTIONS', 'Access-Control-Allow-Headers': '*' }
  : {};

createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS).end(); return; }
  const path = tokens.get(url.searchParams.get('t'));
  if (!path) { res.writeHead(410).end('gone'); return; }

  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      files.set(path, Buffer.concat(chunks));
      res.writeHead(201, CORS).end('');
    });
    return;
  }
  if (req.method === 'GET') {
    const buf = files.get(path);
    if (!buf) { res.writeHead(404).end('no file'); return; }
    res.writeHead(200, { 'Content-Length': buf.length, ...CORS }).end(buf);
    return;
  }
  res.writeHead(405).end();
}).listen(UPLOADER_PORT, '127.0.0.1');

const hrefFor = (path) => {
  const t = randomUUID();
  tokens.set(t, path);
  return `http://127.0.0.1:${UPLOADER_PORT}/?t=${t}`;
};

/* --- эмуляция REST API Диска --- */
globalThis.fetch = async function (input, init = {}) {
  const url = toUrl(input);
  if (url.hostname !== 'cloud-api.yandex.net') return realFetch(input, init);

  const method = (init.method || 'GET').toUpperCase();
  const p = url.searchParams.get('path');
  const endpoint = url.pathname.replace('/v1/disk', '') || '/';

  if (endpoint === '/' || endpoint === '') return json(200, { used_space: 1024, total_space: 1e12 });

  if (endpoint === '/resources' && method === 'PUT') {
    if (dirs.has(p)) return json(409, { error: 'DiskPathPointsToExistentDirectoryError' });
    dirs.add(p);
    return json(201, { href: p });
  }

  if (endpoint === '/resources' && method === 'GET') {
    if (files.has(p)) return json(200, { name: p.split('/').pop(), path: p, size: files.get(p).length });
    if (dirs.has(p)) {
      return json(200, {
        path: p, type: 'dir',
        public_url: 'https://disk.yandex.ru/d/' + Buffer.from(p).toString('base64url').slice(0, 12),
      });
    }
    return json(404, { error: 'DiskNotFoundError' });
  }

  if (endpoint === '/resources' && method === 'DELETE') {
    files.delete(p);
    dirs.delete(p);
    return new Response(null, { status: 204 });   // 204 не может нести тело
  }

  if (endpoint === '/resources/upload') return json(200, { href: hrefFor(p), method: 'PUT' });
  if (endpoint === '/resources/download') {
    if (!files.has(p)) return json(404, { error: 'DiskNotFoundError' });
    return json(200, { href: hrefFor(p) });
  }
  if (endpoint === '/resources/publish') return json(200, { href: p });

  return json(404, { error: 'mock: неизвестный endpoint ' + endpoint });
};

console.log('[mock] Яндекс.Диск подменён, uploader на :' + UPLOADER_PORT);
