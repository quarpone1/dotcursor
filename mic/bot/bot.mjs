// Бот заявок в MAX.
//
// Два режима:
//   BOT_MODE=polling  — забираем события сами (GET /updates). Нужен бот БЕЗ вебхука,
//                       HTTPS и публичный адрес не требуются. Так удобно пробовать.
//   BOT_MODE=webhook  — встаём вебхуком боевого бота и работаем диспетчером:
//                       промежуточные ответы держим у себя, а собранную заявку
//                       отдаём в Planfix одним сообщением.
//
// Принцип, ради которого всё затевалось: в Planfix уходит ОДИН пакет на заявку.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MaxApi, parseUpdate } from './max-api.mjs';
import { createSession, start, handle, summary } from './dialog.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const MODE = process.env.BOT_MODE || 'polling';
const TOKEN = process.env.BOT_MODE === 'webhook'
  ? process.env.MAX_BOT_TOKEN
  : (process.env.MAX_TEST_BOT_TOKEN || process.env.MAX_BOT_TOKEN);
const PORT = Number(process.env.BOT_PORT || 3211);
const PLANFIX_URL = process.env.PLANFIX_WEBHOOK_URL || '';
const STATE_DIR = process.env.BOT_STATE_DIR || process.env.LOG_DIR || join(ROOT, '..', 'data');
const STATE_FILE = join(STATE_DIR, 'bot-sessions.json');
// Адрес вебхука публичный, поэтому в путь зашиваем секрет: чужой POST не пройдёт.
const SECRET = process.env.BOT_WEBHOOK_SECRET || '';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

if (!TOKEN) {
  console.error(MODE === 'webhook'
    ? 'MAX_BOT_TOKEN не задан.'
    : 'MAX_TEST_BOT_TOKEN не задан (для проб заведите отдельного бота у @MasterBot).');
  process.exit(1);
}
if (MODE === 'webhook' && !PLANFIX_URL) {
  console.error('BOT_MODE=webhook требует PLANFIX_WEBHOOK_URL — адрес, куда пересылать готовую заявку.');
  process.exit(1);
}

const api = new MaxApi(TOKEN);
const sessions = new Map();   // userId -> session

const START_RE = /^\/?(start|старт|начать|начало|заявка|help|помощь|\?)$/i;

/* ---------- состояние переживает перезапуск ---------- */

async function loadState() {
  try {
    const raw = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    for (const [id, s] of Object.entries(raw)) {
      if (Date.now() - s.startedAt < SESSION_TTL_MS) sessions.set(Number(id), s);
    }
    if (sessions.size) console.log(`Восстановлено незаконченных диалогов: ${sessions.size}`);
  } catch { /* первого запуска ещё не было */ }
}

let saveTimer = null;
function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(STATE_DIR, { recursive: true });
      await writeFile(STATE_FILE, JSON.stringify(Object.fromEntries(sessions), null, 1), 'utf8');
    } catch (err) { console.error('Не сохранил состояние диалогов:', err.message); }
  }, 500).unref?.() ?? null;
}

/* ---------- пересылка в Planfix ---------- */

async function forwardRaw(update) {
  if (MODE !== 'webhook') return true;
  try {
    const res = await fetch(PLANFIX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!res.ok) console.error(`Planfix не принял событие: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error('Planfix недоступен:', err.message);
    return false;
  }
}

/** Собранная заявка уходит как одно «сообщение пользователя» — задача создастся целиком. */
async function deliverTicket(session) {
  const card = summary(session);

  if (MODE !== 'webhook') {
    console.log(`\n─── ${session.ticketNo}: в Planfix ушло бы это ───\n${card}\n`);
    return true;
  }

  const sample = session.lastUserUpdate;
  if (!sample?.message?.sender) {
    console.error('Нет настоящего сообщения пользователя для пересылки:', session.ticketNo);
    return false;
  }
  // Берём подлинное событие и меняем только текст: отправитель, чат и mid
  // остаются настоящими, иначе Planfix не свяжет задачу с человеком
  // и ответы инженера будет некуда доставлять.
  const base = structuredClone(sample);
  base.update_type = 'message_created';
  base.timestamp = Date.now();
  base.message.body = { ...(base.message.body || {}), text: card, attachments: [] };

  const ok = await forwardRaw(base);
  // вложения досылаем исходными событиями — так они лягут в ту же задачу
  for (const raw of session.pendingAttachments || []) await forwardRaw(raw);
  return ok;
}

/* ---------- обработка одного события ---------- */

async function reply(target, messages) {
  for (const m of messages) {
    if (!m?.text) continue;
    await api.send({ userId: target.userId, chatId: target.chatId, text: m.text, buttons: m.buttons });
  }
}

export async function dispatch(update) {
  const ev = parseUpdate(update);
  if (!ev.userId && !ev.chatId) return;

  const session = sessions.get(ev.userId);

  // Диалога нет. Два случая:
  //  · человек пишет впервые — начинаем заявку с любого сообщения, иначе бот
  //    выглядит сломанным: пишешь ему, а он молчит;
  //  · заявка уже отправлена — это переписка по задаче, пропускаем в Planfix
  //    как есть, иначе сломается ответ инженеру.
  if (!session || session.phase === 'done' || session.phase === 'cancelled') {
    const said = (ev.text || '').trim();
    const isStart =
      ev.kind === 'start' ||
      !session ||                                   // первое обращение
      (ev.kind === 'callback' && ev.payload === 'new:ticket') ||
      (ev.kind === 'text' && START_RE.test(said));
    if (!isStart) return void (await forwardRaw(update));

    if (ev.kind === 'callback' && ev.callbackId) {
      await api.answerCallback(ev.callbackId).catch(() => {});
    }
    const fresh = createSession({ id: ev.userId, name: ev.userName });
    fresh.pendingAttachments = [];
    sessions.set(ev.userId, fresh);
    saveStateSoon();
    await reply(ev, [
      {
        text: 'Здравствуйте! Помогу оформить заявку в техподдержку МИС.\n' +
              'Задам несколько коротких вопросов и отправлю всё инженеру одним сообщением.\n\n' +
              'В любой момент можно написать «отмена».',
        buttons: [],
      },
      ...start(fresh),
    ]);
    return;
  }

  // Образец для итогового пакета — только настоящее сообщение пользователя.
  // У события от кнопки отправитель — бот (кнопка приклеена к его сообщению),
  // и Planfix по такому пакету не свяжет задачу с человеком.
  if (ev.kind === 'text' || ev.kind === 'attachment') {
    session.lastUserUpdate = update;
  }

  // Вложения запоминаем целиком: досылаем их в Planfix вместе с готовой заявкой.
  if (ev.kind === 'attachment') {
    session.pendingAttachments = session.pendingAttachments || [];
    session.pendingAttachments.push(update);
  }

  const input =
    ev.kind === 'callback' ? { type: 'callback', payload: ev.payload }
    : ev.kind === 'attachment' ? { type: 'attachment', file: ev.attachments[0] }
    : { type: 'text', text: ev.text };

  let result;
  try {
    result = handle(session, input);
  } catch (err) {
    // Логика упала — не теряем сообщение пользователя, отдаём его Planfix как раньше.
    console.error('Сбой диалога, пропускаю событие в Planfix:', err.message);
    sessions.delete(ev.userId);
    await forwardRaw(update);
    return;
  }

  if (ev.kind === 'callback' && ev.callbackId) {
    await api.answerCallback(ev.callbackId).catch(() => {});
  }
  await reply(ev, result.replies);

  if (result.done) {
    const ok = await deliverTicket(session);
    // Кнопка на будущее: после заявки обычные сообщения уходят инженеру,
    // и человеку нужен явный способ начать новую.
    await reply(ev, [{
      text: 'Если понадобится ещё одна заявка — нажмите кнопку или напишите «заявка».',
      buttons: [[{ text: '📝 Новая заявка', payload: 'new:ticket' }]],
    }]);
    if (!ok) {
      await reply(ev, [{
        text: 'Заявку собрал, но не смог передать её в поддержку. Сообщите об этом — текст заявки сохранён.',
        buttons: [],
      }]);
    }
  }
  if (result.done || result.cancelled) {
    session.pendingAttachments = [];
  }
  saveStateSoon();
}

/* ---------- режимы ---------- */

async function runPolling() {
  const me = await api.me();
  console.log(`Бот «${me.name}» @${me.username} слушает поллингом. Напишите ему «заявка».`);
  const subs = await api.subscriptions().catch(() => null);
  if (subs?.subscriptions?.length) {
    console.error('\n‼ У этого бота есть вебхук:');
    for (const s of subs.subscriptions) console.error('   ' + s.url);
    console.error('  Пока он стоит, события поллингом НЕ придут. Возьмите тестового бота без вебхука.\n');
  }

  let marker;
  for (;;) {
    try {
      const res = await api.updates({ marker, timeout: 30 });
      for (const u of res.updates || []) {
        await dispatch(u).catch((e) => console.error('Ошибка обработки:', e.message));
      }
      marker = res.marker ?? marker;
    } catch (err) {
      console.error('Поллинг:', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function runWebhook() {
  createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, mode: MODE, dialogs: sessions.size }));
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (SECRET && !req.url.includes(SECRET)) {
      console.error('Отклонён POST без секрета в пути:', req.url.slice(0, 40));
      res.writeHead(404).end();
      return;
    }

    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 2 * 1024 * 1024) { res.writeHead(413).end(); return; }
      chunks.push(c);
    }
    // MAX ждёт быстрый 200: подтверждаем сразу, работаем после.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');

    let update;
    try { update = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return console.error('Пришло не-JSON тело вебхука'); }

    dispatch(update).catch(async (err) => {
      console.error('Ошибка обработки, пропускаю в Planfix:', err.message);
      await forwardRaw(update);
    });
  }).listen(PORT, '127.0.0.1', () => {
    console.log(`Бот слушает вебхук на 127.0.0.1:${PORT}, пересылка в ${PLANFIX_URL}`);
  });
}

/** MAX показывает эти команды в меню бота — «старт» становится видимой кнопкой. */
async function registerCommands() {
  const commands = [
    { name: 'start', description: 'Оформить заявку в техподдержку' },
    { name: 'cancel', description: 'Отменить текущую заявку' },
  ];
  // В документации метод описан по-разному, поэтому пробуем оба адреса.
  for (const [path, body] of [['/me', { commands }], ['/me/commands', { commands }]]) {
    try {
      await api.call('PATCH', path, { body });
      console.log(`Команды бота зарегистрированы через ${path}: /start, /cancel`);
      return;
    } catch (err) {
      console.error(`PATCH ${path} не прошёл: ${err.message}`);
    }
  }
  console.error('Команды зарегистрировать не удалось — на работу бота это не влияет.');
}

await loadState();
await registerCommands();
if (MODE === 'webhook') runWebhook(); else await runPolling();
