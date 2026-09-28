// Сторож на поддельных форме, боте и MAX: тревога, напоминание, «починилось»,
// повтор неушедшей тревоги. Запуск: npm run watchdog:test
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORM_PORT = 3501, BOT_PORT = 3502, MAX_PORT = 3503, DEAD_PORT = 3509;
const SECRET = 'hook-secret-123';

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

/* Что отвечают поддельные сервисы — меняем по ходу сценария */
const world = {
  formUp: true,
  healthOk: true,
  botUp: true,
  tokenOk: true,
  webhook: `https://zayavka.example.ru/max-hook/${SECRET}`,
  messagesFail: false,
};
const sent = [];

const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));

const formSrv = createServer((req, res) => {
  if (!world.formUp) return json(res, 502, { error: 'down' });
  if (req.url === '/api/limits') return json(res, 200, { maxFiles: 10 });
  if (req.url === '/api/health') {
    return world.healthOk
      ? json(res, 200, { ok: true, disk: { used: 1, total: 2 }, mail: { ok: true } })
      : json(res, 502, { ok: false, disk: { used: 1, total: 2 }, mail: { ok: false, error: 'Invalid user or password' } });
  }
  json(res, 404, {});
}).listen(FORM_PORT, '127.0.0.1');

const botSrv = createServer((req, res) => {
  if (world.botUp && req.url === '/health') return json(res, 200, { ok: true });
  json(res, 500, {});
}).listen(BOT_PORT, '127.0.0.1');

const maxSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (url.pathname === '/me') {
    return world.tokenOk ? json(res, 200, { user_id: 1, name: 'Бот' }) : json(res, 401, { code: 'verify.token' });
  }
  if (url.pathname === '/subscriptions') return json(res, 200, { subscriptions: world.webhook ? [{ url: world.webhook }] : [] });
  if (url.pathname === '/messages') {
    if (world.messagesFail) return json(res, 500, { code: 'internal' });
    sent.push({ chatId: url.searchParams.get('chat_id'), auth: req.headers.authorization, ...JSON.parse(Buffer.concat(chunks).toString()) });
    return json(res, 200, { message: {} });
  }
  json(res, 404, {});
}).listen(MAX_PORT, '127.0.0.1');

const stateDir = await mkdtemp(join(tmpdir(), 'watchdog-'));

const run = (env = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['tools/watchdog.mjs'], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      MAX_API_BASE: `http://127.0.0.1:${MAX_PORT}`,
      MAX_BOT_TOKEN: 'bot-token',
      BOT_WEBHOOK_SECRET: SECRET,
      MAX_ALERT_CHAT_ID: '-71234567890',
      WATCH_FORM_URL: `http://127.0.0.1:${FORM_PORT}`,
      WATCH_BOT_URL: `http://127.0.0.1:${BOT_PORT}`,
      WATCH_HOST_NAME: 'mis-server',
      WATCH_DEEP_MIN: '0',
      BOT_STATE_DIR: stateDir,
      ...env,
    },
  });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});
const newMessages = async (env) => {
  const before = sent.length;
  const r = await run(env);
  return { ...r, msgs: sent.slice(before) };
};

console.log('Всё работает');
{
  const r = await newMessages();
  check('код 0 и тишина в канале', r.code === 0 && r.msgs.length === 0, r.out);
  check('проверены форма, здоровье, бот, MAX и вебхук', ['form', 'health', 'bot', 'max', 'webhook'].every((n) => r.out.includes(`✓ ${n}`)), r.out);
}

console.log('Бот упал');
world.botUp = false;
{
  const r1 = await newMessages();
  check('первая неудача — ещё без тревоги (защита от мигания)', r1.code === 1 && r1.msgs.length === 0, r1.out);
  const r2 = await newMessages();
  check('вторая подряд — тревога в канал', r2.msgs.length === 1 && /Бот заявок не отвечает/.test(r2.msgs[0].text), JSON.stringify(r2.msgs));
  check('тревога в нужный канал, html, с именем сервера', r2.msgs[0]?.chatId === '-71234567890' && r2.msgs[0]?.format === 'html' && /mis-server/.test(r2.msgs[0]?.text), JSON.stringify(r2.msgs[0]));
  check('шлёт от бота заявок, если отдельного токена нет', r2.msgs[0]?.auth === 'bot-token', r2.msgs[0]?.auth);
  const r3 = await newMessages();
  check('дальше не спамит каждую минуту', r3.msgs.length === 0, JSON.stringify(r3.msgs));
  const r4 = await newMessages({ WATCH_REMIND_MIN: '0' });
  check('напоминает, когда подошло время', r4.msgs.length === 1 && /всё ещё/.test(r4.msgs[0].text), JSON.stringify(r4.msgs));
}
world.botUp = true;
{
  const r = await newMessages();
  check('поднялся — одно сообщение «снова отвечает»', r.code === 0 && r.msgs.length === 1 && /🟢.*Бот заявок снова отвечает/.test(r.msgs[0].text), JSON.stringify(r.msgs));
  const r2 = await newMessages();
  check('после этого снова тишина', r2.msgs.length === 0, JSON.stringify(r2.msgs));
}

console.log('Процесс формы не запущен');
{
  const env = { WATCH_FORM_URL: `http://127.0.0.1:${DEAD_PORT}` };
  await newMessages(env);
  const r = await newMessages(env);
  const m = r.msgs.find((x) => /Форма заявок не отвечает/.test(x.text));
  check('тревога с понятной причиной', m && /сервис остановлен/.test(m.text), JSON.stringify(r.msgs));
  await newMessages(); // форма «вернулась» — сбрасываем состояние
}

console.log('Почта отвалилась');
world.healthOk = false;
{
  await newMessages();
  const r = await newMessages();
  const m = r.msgs.find((x) => /не видит Яндекс.Диск или почту/.test(x.text));
  check('тревога с текстом ошибки SMTP', m && /Invalid user or password/.test(m.text), JSON.stringify(r.msgs));
}
world.healthOk = true;
{
  const r = await newMessages({ WATCH_DEEP_MIN: '60' });
  check('глубокую проверку не гоняем чаще WATCH_DEEP_MIN', !r.out.includes('health'), r.out);
  const r2 = await newMessages();
  check('на следующей глубокой проверке — «снова видит»', r2.msgs.some((x) => /снова видит/.test(x.text)), JSON.stringify(r2.msgs));
}

console.log('Вебхук перехватил Planfix');
world.webhook = 'https://sensey.planfix.ru/endpoints/max?botId=391026515';
{
  await newMessages();
  const r = await newMessages();
  const m = r.msgs.find((x) => /Вебхук MAX смотрит не на бота заявок/.test(x.text));
  check('тревога с текущим адресом и командой возврата', m && /planfix\.ru/.test(m.text) && /max:webhook/.test(m.text), JSON.stringify(r.msgs));
}
world.webhook = `https://zayavka.example.ru/max-hook/${SECRET}`;
await newMessages();

console.log('MAX не принял тревогу');
world.botUp = false;
world.messagesFail = true;
{
  await newMessages();
  const r = await newMessages();
  check('код 1 и запись в журнал', r.code === 1 && /Тревога не ушла в MAX/.test(r.out), r.out);
  world.messagesFail = false;
  const r2 = await newMessages();
  check('на следующем прогоне тревога уходит повторно', r2.msgs.some((x) => /Бот заявок не отвечает/.test(x.text)), JSON.stringify(r2.msgs));
}
world.botUp = true;
await newMessages();

console.log('Настройки');
{
  const r = await newMessages({ BOT_WEBHOOK_SECRET: '' });
  check('бот заявок не установлен — его проверки пропускаются', r.code === 0 && !/ (bot|max|webhook)\b/.test(r.out), r.out);
  const r2 = await newMessages({ WATCH_SKIP: 'webhook,health' });
  check('WATCH_SKIP отключает проверки', !/webhook|health/.test(r2.out), r2.out);
  const r3 = await newMessages({ MAX_ALERT_TOKEN: 'alert-token', WATCH_FORM_URL: `http://127.0.0.1:${DEAD_PORT}`, WATCH_FAIL_AFTER: '1' });
  check('отдельный токен мониторинга используется для тревог', r3.msgs[0]?.auth === 'alert-token', JSON.stringify(r3.msgs));
  const r4 = await run({ MAX_ALERT_CHAT_ID: '' });
  check('без канала — код 2', r4.code === 2 && /MAX_ALERT_CHAT_ID/.test(r4.out), r4.out);
}

formSrv.close(); botSrv.close(); maxSrv.close();
await rm(stateDir, { recursive: true, force: true });

console.log(failed ? `\n✗ Провалено проверок: ${failed}` : '\n✓ Всё прошло');
process.exit(failed ? 1 : 0);
