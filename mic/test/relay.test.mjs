// Сквозная проверка обратного канала: заявка → задача → комментарий инженера
// → сообщение человеку в MAX. Всё на поддельных MAX и Planfix.
// Запуск: npm run relay:test
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PORT = 3496, PF_PORT = 3497, BOT_PORT = 3498;
const STATE_DIR = join(ROOT, 'test', '.tmp-relay');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const sentToUser = [];
let taskCreated = null;
let comments = [];          // что «написали» инженеры в задаче

const body = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  if (!/application\/json/.test(req.headers['content-type'] || '')) return { raw };
  try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
};

const maxSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const b = await body(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (url.pathname === '/messages') { sentToUser.push(b); return res.end('{"message":{}}'); }
  if (url.pathname === '/subscriptions') return res.end('{"subscriptions":[]}');
  res.end('{"result":"ok"}');
}).listen(MAX_PORT, '127.0.0.1');

const pfSrv = createServer(async (req, res) => {
  const b = await body(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/contact/list') {
    return res.end(JSON.stringify({ contacts: [{ id: 971, name: 'Дмитрий', lastname: 'Серов', isCompany: false }] }));
  }
  if (req.url === '/task/') { taskCreated = b; return res.end(JSON.stringify({ id: 18001 })); }
  if (req.url === '/task/18001/comments/list') return res.end(JSON.stringify({ comments }));
  res.end('{"result":"success"}');
}).listen(PF_PORT, '127.0.0.1');

await rm(STATE_DIR, { recursive: true, force: true });

const bot = spawn(process.execPath, ['bot/bot.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    BOT_MODE: 'webhook',
    MAX_BOT_TOKEN: 'test-token',
    MAX_API_BASE: `http://127.0.0.1:${MAX_PORT}`,
    PLANFIX_WEBHOOK_URL: `http://127.0.0.1:${PF_PORT}/unused`,
    PLANFIX_API_TOKEN: 'pf-token',
    PLANFIX_API_BASE: `http://127.0.0.1:${PF_PORT}`,
    PLANFIX_PROJECT_ID: '16521',
    PLANFIX_RELAY_SECONDS: '1',
    BOT_PORT: String(BOT_PORT),
    BOT_STATE_DIR: STATE_DIR,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const logs = [];
bot.stdout.on('data', (d) => { logs.push(String(d)); });
bot.stderr.on('data', (d) => { logs.push(String(d)); process.stderr.write('  [bot!] ' + d); });

for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${BOT_PORT}/health`); break; } catch { await sleep(100); }
}

const USER = 971001;
const post = async (u) => {
  await fetch(`http://127.0.0.1:${BOT_PORT}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u),
  });
  await sleep(120);
};
const msg = (text) => ({
  update_type: 'message_created', timestamp: Date.now(),
  message: {
    sender: { user_id: USER, name: 'Дмитрий Серов' },
    recipient: { chat_id: 777, user_id: USER },
    body: { mid: 'm' + Math.random(), seq: 1, text, attachments: [] },
  },
});
const btn = (payload) => ({
  update_type: 'message_callback', timestamp: Date.now(),
  callback: { callback_id: 'cb' + Math.random(), payload, user: { user_id: USER, name: 'Дмитрий Серов' } },
  message: {
    sender: { user_id: 391026515, is_bot: true },
    recipient: { chat_id: 777, user_id: USER },
    body: { mid: 'bot', text: '' },
  },
});
const lastText = () => sentToUser[sentToUser.length - 1]?.text || '';

try {
  console.log('\n1. Заявка целиком');
  await post(msg('заявка'));
  await post(btn('c:kind:0'));
  await post(btn('c:clinic:0'));
  await post(btn('c:module:0'));
  await post(btn('c:role:0'));
  await post(msg('Иванов А. А. / логин 123'));
  await post(btn('skip'));
  await post(msg('Не печатается чек'));
  await post(msg('1. Открыть смену 2. Пробить услугу'));
  await post(msg('Ошибка драйвера'));
  await post(msg('Чек печатается'));
  await post(btn('c:urgency:0'));
  await post(msg('+7 900 000-00-00'));
  await post(btn('files:done'));
  await post(btn('ok:send'));
  await sleep(400);

  check('задача создана через API', taskCreated !== null);
  check('заказчик — найденный контакт', taskCreated?.counterparty?.id === 'contact:971',
    JSON.stringify(taskCreated?.counterparty));
  check('задача легла в проект', taskCreated?.project?.id === 16521, JSON.stringify(taskCreated?.project));

  console.log('\n2. Инженер пишет ВНУТРЕННИЙ комментарий');
  comments = [{
    id: 500, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Посмотрю логи кассы',
    recipients: { users: [{ id: 'user:63', name: 'Щербаков' }] },
  }];
  const before = sentToUser.length;
  await sleep(1600);
  check('внутреннее клиенту НЕ ушло', sentToUser.length === before,
    lastText().slice(0, 60));
  check('и в логах написано почему',
    logs.join('').includes('не адресован клиенту'), 'нет строки в логе');

  console.log('\n3. Инженер отвечает КЛИЕНТУ');
  comments = [...comments, {
    id: 501, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Уточните номер кассы,<br>пожалуйста',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
  }];
  await sleep(1600);
  const relayed = lastText();
  check('ответ доставлен в MAX', /Уточните номер кассы/.test(relayed), relayed.slice(0, 80));
  check('видно, по какой заявке', /Ответ по заявке ТП-/.test(relayed), relayed.slice(0, 40));
  check('указан автор', /Фиголь Роман/.test(relayed), relayed.slice(0, 60));
  check('разметка убрана', !/<br>/.test(relayed), relayed);

  console.log('\n4. Повтор не дублируется');
  const count = sentToUser.length;
  await sleep(1600);
  check('тот же комментарий второй раз не отправлен', sentToUser.length === count,
    `было ${count}, стало ${sentToUser.length}`);
} finally {
  bot.kill();
  maxSrv.close();
  pfSrv.close();
  await sleep(150);
  await rm(STATE_DIR, { recursive: true, force: true });
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nОбратный канал работает');
process.exit(failed ? 1 : 0);
