// Отправка в канал MAX и доверие к сертификату Минцифры — на поддельном MAX.
// Запуск: npm run max:test
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PORT = 3495, TLS_PORT = 3496;

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const requests = [];
const world = { chatsGone: false };
const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return { raw }; }
};

/* Поддельный MAX: принимает только правильный токен и известный канал */
const maxSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = req.method === 'POST' ? await readBody(req) : {};
  requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization, body });
  const json = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
  if (req.headers.authorization !== 'alert-token') return json(401, { code: 'verify.token', message: 'Invalid access_token' });
  if (url.pathname === '/chats') {
    // Как сейчас в MAX: метод отключён
    if (world.chatsGone) return json(404, { code: 'method.not.found', message: 'Path /chats is not recognized' });
    return json(200, { chats: [{ chat_id: -71234567890, type: 'channel', title: 'Мониторинг — алерты' }] });
  }
  if (url.pathname === '/chats/-71234567890') return json(200, { chat_id: -71234567890, type: 'channel', title: 'Алерты МИЦ' });
  if (url.pathname.startsWith('/chats/')) return json(404, { code: 'chat.not.found' });
  if (url.pathname === '/messages') {
    if (url.searchParams.get('chat_id') !== '-71234567890') return json(404, { code: 'chat.not.found', message: 'Chat not found' });
    return json(200, { message: { body: { text: body.text } } });
  }
  json(404, {});
}).listen(MAX_PORT, '127.0.0.1');

const run = (args, { env = {}, stdin } = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['tools/max-send.mjs', ...args], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      MAX_API_BASE: `http://127.0.0.1:${MAX_PORT}`,
      MAX_ALERT_TOKEN: 'alert-token',
      MAX_ALERT_CHAT_ID: '-71234567890',
      ...env,
    },
  });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.stdin.end(stdin ?? '');
  p.on('close', (code) => resolve({ code, out }));
});

console.log('Отправка в канал');
{
  requests.length = 0;
  const r = await run(['<b>Тест</b>: бот подключён к каналу']);
  const q = requests.find((x) => x.path === '/messages');
  check('уходит одним POST /messages', r.code === 0 && q?.method === 'POST', r.out);
  check('токен в Authorization как есть, без Bearer', q?.auth === 'alert-token', q?.auth);
  check('chat_id канала — в строке запроса, с минусом', q?.query.chat_id === '-71234567890', JSON.stringify(q?.query));
  check('тело {text, format: html}', q?.body.text === '<b>Тест</b>: бот подключён к каналу' && q?.body.format === 'html', JSON.stringify(q?.body));
}
{
  requests.length = 0;
  const r = await run([], { stdin: 'Сбой: не отвечает МИС\n' });
  const q = requests.find((x) => x.path === '/messages');
  check('текст можно подать через stdin', r.code === 0 && q?.body.text === 'Сбой: не отвечает МИС', r.out);
}
{
  requests.length = 0;
  await run(['просто текст', '--format', 'plain']);
  const q = requests.find((x) => x.path === '/messages');
  check('--format plain — без поля format', q && !('format' in q.body), JSON.stringify(q?.body));
}
{
  requests.length = 0;
  await run(['x'.repeat(5000)]);
  const q = requests.find((x) => x.path === '/messages');
  check('длинный текст обрезается до 4000 символов', q?.body.text.length === 4000, String(q?.body.text.length));
}
{
  const r = await run(['текст'], { env: { MAX_ALERT_TOKEN: '', MAX_BOT_TOKEN: 'alert-token' } });
  check('без MAX_ALERT_TOKEN берётся MAX_BOT_TOKEN', r.code === 0, r.out);
}

console.log('Ошибки видны мониторингу');
{
  const r = await run(['текст'], { env: { MAX_ALERT_TOKEN: 'Bearer alert-token' } });
  check('неверный токен → код выхода 1 и подсказка про Bearer', r.code === 1 && /Bearer/.test(r.out), r.out);
}
{
  const r = await run(['текст', '--chat', '71234567890']);
  check('чужой chat_id → код 1 и подсказка про минус', r.code === 1 && /минусом/.test(r.out), r.out);
}
{
  const r = await run(['текст'], { env: { MAX_ALERT_CHAT_ID: '' } });
  check('без канала → код 2 и совет, где взять chat_id', r.code === 2 && /--chats/.test(r.out), r.out);
}

console.log('Поиск chat_id');
{
  const r = await run(['--chats']);
  check('--chats печатает id, тип и название канала', r.code === 0 && /-71234567890\tchannel\tМониторинг — алерты/.test(r.out), r.out);
}

console.log('GET /chats отключён — список из событий bot_added');
{
  world.chatsGone = true;
  const stateDir = await mkdtemp(join(tmpdir(), 'max-chats-'));
  const env = { BOT_STATE_DIR: stateDir };
  const empty = await run(['--chats'], { env });
  check('пока бот ничего не видел — объясняет, как получить chat_id', empty.code === 0 && /добавьте снова/.test(empty.out), empty.out);
  await writeFile(join(stateDir, 'bot-chats.json'), JSON.stringify({
    '-71234567890': { title: 'Алерты МИЦ', type: 'channel', active: true },
    '-70000000001': { title: 'Старый канал', type: 'channel', active: true },
    '-70000000002': { title: 'Удалённый', type: 'channel', active: false },
  }));
  const r = await run(['--chats'], { env });
  check('печатает запомненный канал с названием из MAX', /-71234567890\tchannel\tАлерты МИЦ\n/.test(r.out), r.out);
  check('канал, который MAX не отдаёт, помечен', /-70000000001.*бота убрали/.test(r.out), r.out);
  check('канал, откуда бота убрали, не показан', !/-70000000002/.test(r.out), r.out);
  await rm(stateDir, { recursive: true, force: true });
  world.chatsGone = false;
}

maxSrv.close();

/* Сертификат Минцифры: свой корневой центр, как у platform-api2.max.ru */
console.log('Сертификат для platform-api2.max.ru');
let openssl = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { openssl = false; }
if (!openssl) {
  console.log('  · openssl не найден — проверка TLS пропущена');
} else {
  const dir = await mkdtemp(join(tmpdir(), 'max-tls-'));
  const ssl = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'ignore' });
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2',
    '-subj', '/CN=Test Trusted Root CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'srv.key', '-out', 'srv.csr', '-subj', '/CN=localhost');
  await writeFile(join(dir, 'ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
  ssl('x509', '-req', '-in', 'srv.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'srv.pem', '-days', '2', '-extfile', 'ext');
  // Сертификат с госуслуг бывает и в DER — такой тоже должен подойти
  ssl('x509', '-in', 'ca.pem', '-outform', 'DER', '-out', 'ca.cer');

  const tlsSrv = createHttpsServer(
    { key: await readFile(join(dir, 'srv.key')), cert: await readFile(join(dir, 'srv.pem')) },
    (req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"chats":[]}'),
  ).listen(TLS_PORT, '127.0.0.1');

  const base = `https://127.0.0.1:${TLS_PORT}`;
  const noCa = await run(['--chats'], { env: { MAX_API_BASE: base, MAX_CA_FILE: join(dir, 'missing.pem') } });
  check('без сертификата — понятная ошибка про сертификат Минцифры', noCa.code === 1 && /сертификат/.test(noCa.out), noCa.out);
  const pem = await run(['--chats'], { env: { MAX_API_BASE: base, MAX_CA_FILE: join(dir, 'ca.pem') } });
  check('с MAX_CA_FILE (PEM) соединение проходит', pem.code === 0, pem.out);
  const der = await run(['--chats'], { env: { MAX_API_BASE: base, MAX_CA_FILE: join(dir, 'ca.cer') } });
  check('с MAX_CA_FILE (DER) соединение проходит', der.code === 0, der.out);

  tlsSrv.close();
  await rm(dir, { recursive: true, force: true });
}

console.log(failed ? `\n✗ Провалено проверок: ${failed}` : '\n✓ Всё прошло');
process.exit(failed ? 1 : 0);
