// Проверка бота на поддельных MAX и Planfix.
// Главное, что доказываем: в Planfix уходит РОВНО ОДИН пакет на заявку,
// промежуточные ответы туда не попадают, а переписка после заявки — попадает.
// Запуск: npm run bot:test
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PORT = 3491, PLANFIX_PORT = 3492, BOT_PORT = 3493;
const STATE_DIR = join(ROOT, 'test', '.tmp-bot');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const sentToUser = [];     // сообщения бота пользователю
const forwarded = [];      // всё, что ушло в Planfix

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch { return { raw }; }
};

/* Поддельный MAX */
const maxSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = req.method === 'POST' ? await readBody(req) : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (url.pathname === '/me') return res.end(JSON.stringify({ name: 'Тест', username: 'test_bot', user_id: 1 }));
  if (url.pathname === '/subscriptions') return res.end(JSON.stringify({ subscriptions: [] }));
  if (url.pathname === '/messages') { sentToUser.push(body); return res.end(JSON.stringify({ message: {} })); }
  if (url.pathname === '/answers') return res.end(JSON.stringify({ success: true }));
  res.end('{}');
}).listen(MAX_PORT, '127.0.0.1');

/* Поддельный Planfix */
const pfSrv = createServer(async (req, res) => {
  forwarded.push(await readBody(req));
  res.writeHead(200).end('ok');
}).listen(PLANFIX_PORT, '127.0.0.1');

await rm(STATE_DIR, { recursive: true, force: true });

const bot = spawn(process.execPath, ['bot/bot.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    BOT_MODE: 'webhook',
    MAX_BOT_TOKEN: 'test-token',
    MAX_API_BASE: `http://127.0.0.1:${MAX_PORT}`,
    PLANFIX_WEBHOOK_URL: `http://127.0.0.1:${PLANFIX_PORT}/endpoints/max`,
    BOT_PORT: String(BOT_PORT),
    BOT_STATE_DIR: STATE_DIR,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
bot.stdout.on('data', (d) => process.stdout.write('  [bot] ' + d));
bot.stderr.on('data', (d) => process.stderr.write('  [bot!] ' + d));

for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${BOT_PORT}/health`); break; } catch { await sleep(100); }
}

const USER = 555;
const post = async (update) => {
  await fetch(`http://127.0.0.1:${BOT_PORT}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
  });
  await sleep(120);   // даём боту доработать: ответ он отдаёт до обработки
};

const msg = (text, attachments = []) => ({
  update_type: 'message_created',
  timestamp: Date.now(),
  message: {
    sender: { user_id: USER, name: 'Иванов' },
    recipient: { chat_id: 777, user_id: USER },
    body: { mid: 'm' + Math.random(), seq: 1, text, attachments },
  },
});

// Как в жизни: у события от кнопки в message лежит сообщение БОТА,
// к которому кнопка приклеена. Отправитель там — бот, а не человек.
const BOT_ID = 391026515;
const btn = (payload) => ({
  update_type: 'message_callback',
  timestamp: Date.now(),
  callback: { callback_id: 'cb' + Math.random(), payload, user: { user_id: USER, name: 'Иванов' } },
  message: {
    sender: { user_id: BOT_ID, is_bot: true, name: 'Сопровождение МИЦ' },
    recipient: { chat_id: 777, user_id: USER },
    body: { mid: 'bot-msg', seq: 1, text: 'вопрос бота', attachments: [] },
  },
});

const lastText = () => sentToUser[sentToUser.length - 1]?.text || '';

try {
  console.log('\n1. Старт диалога');
  await post(msg('заявка'));
  check('бот поздоровался и задал первый вопрос', /Что оформляем/i.test(lastText()), lastText().slice(0, 60));
  check('в Planfix пока ничего не ушло', forwarded.length === 0, String(forwarded.length));

  console.log('\n2. Проходим опрос');
  await post(btn('c:kind:0'));
  await post(btn('c:clinic:0'));
  await post(btn('c:module:0'));
  await post(btn('c:role:0'));
  await post(msg('Иванов А. А. / логин 123'));
  await post(btn('skip'));
  await post(msg('Не печатается чек на кассе'));
  await post(msg('1. Открыть смену 2. Пробить услугу 3. Печать'));
  await post(msg('Ошибка драйвера'));
  await post(msg('Чек печатается'));
  await post(btn('c:urgency:0'));
  await post(msg('+7 900 000-00-00'));
  check('дошли до вложений', /Приложите/.test(lastText()), lastText().slice(0, 60));
  check('за весь опрос в Planfix по-прежнему пусто', forwarded.length === 0,
    `ушло ${forwarded.length}`);

  console.log('\n3. Вложение');
  await post(msg('', [{ type: 'image', payload: { filename: 'скрин.png', size: 12345, url: 'http://x/1' } }]));
  check('вложение принято ботом', /Приложено: 1/.test(lastText()), lastText().slice(-40));
  check('вложение тоже придержано', forwarded.length === 0, String(forwarded.length));

  console.log('\n4. Подтверждение и отправка');
  await post(btn('files:done'));
  check('показана карточка целиком', /Проверьте, всё ли верно/.test(lastText()));
  await post(btn('ok:send'));
  await sleep(300);

  const cards = forwarded.filter((f) => /Заявка ТП-/.test(f?.message?.body?.text || ''));
  check('в Planfix ушёл ровно один пакет с заявкой', cards.length === 1, `ушло ${cards.length}`);

  const card = cards[0]?.message?.body?.text || '';
  check('в пакете все ответы разом',
    /Клиника: МедГород/.test(card) && /Модуль: ЭМК/.test(card) &&
    /Не печатается чек/.test(card) && /Ошибка драйвера/.test(card) && /\+7 900/.test(card),
    card.slice(0, 80));
  check('пакет отправлен ОТ ИМЕНИ ПОЛЬЗОВАТЕЛЯ, а не бота',
    cards[0]?.update_type === 'message_created' && cards[0]?.message?.sender?.user_id === USER,
    `sender=${cards[0]?.message?.sender?.user_id}`);
  check('в пакете настоящий чат пользователя', cards[0]?.message?.recipient?.chat_id === 777);

  const withFiles = forwarded.filter((f) => (f?.message?.body?.attachments || []).length);
  check('вложение доехало отдельным событием', withFiles.length === 1, String(withFiles.length));
  check('всего в Planfix две передачи: заявка и файл', forwarded.length === 2,
    `их ${forwarded.length}`);

  console.log('\n5. Сообщение вне диалога');
  const before = forwarded.length;
  await post(msg('А когда починят?'));
  check('в Planfix оно не уходит', forwarded.length === before, `было ${before}, стало ${forwarded.length}`);
  check('человеку показано меню', /Что сделать/.test(lastText()) &&
    JSON.stringify(sentToUser[sentToUser.length - 1]?.attachments || []).includes('my:tickets'),
    lastText().slice(0, 40));

  console.log('\n6. Вторая заявка тем же пользователем');
  const before2 = forwarded.length;
  await post(msg('заявка'));
  check('новый диалог начался', /Что оформляем/i.test(lastText()));
  check('и снова ничего не утекает', forwarded.length === before2, String(forwarded.length - before2));
} finally {
  bot.kill();
  maxSrv.close();
  pfSrv.close();
  await sleep(150);
  await rm(STATE_DIR, { recursive: true, force: true });
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nБот отдаёт заявку одним пакетом');
process.exit(failed ? 1 : 0);
