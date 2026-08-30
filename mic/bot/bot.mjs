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
import { createTask, findContact, taskName, planfixConfigured,
         uploadFile, newComments, addressedToContact, createContact } from './planfix.mjs';
import { priorityOf } from '../ticket.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const MODE = process.env.BOT_MODE || 'polling';
const TOKEN = process.env.BOT_MODE === 'webhook'
  ? process.env.MAX_BOT_TOKEN
  : (process.env.MAX_TEST_BOT_TOKEN || process.env.MAX_BOT_TOKEN);
const PORT = Number(process.env.BOT_PORT || 3211);
const PLANFIX_URL = process.env.PLANFIX_WEBHOOK_URL || '';
const STATE_DIR = process.env.BOT_STATE_DIR || process.env.LOG_DIR || join(ROOT, '..', 'data');
const STATE_FILE = join(STATE_DIR, 'bot-sessions.json');
const TICKETS_FILE = join(STATE_DIR, 'bot-tickets.json');
// Как часто спрашивать Planfix о новых ответах инженеров
const RELAY_EVERY_MS = Number(process.env.PLANFIX_RELAY_SECONDS || 60) * 1000;
// 'addressed' — только адресованные клиенту, 'all' — любые реплики сотрудников.
// По умолчанию осторожный режим: внутреннее обсуждение клиенту видеть незачем.
const RELAY_MODE = process.env.PLANFIX_RELAY || 'addressed';
// Сколько дней следим за задачей после создания
const RELAY_DAYS = Number(process.env.PLANFIX_RELAY_DAYS || 14);
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

async function saveState() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(Object.fromEntries(sessions), null, 1), 'utf8');
  } catch (err) { console.error('Не сохранил состояние диалогов:', err.message); }
}

// Пишем сразу после каждого события. Отложенная запись с unref() терялась при
// перезапуске сервиса — диалог обрывался, и ответы человека уходили в Planfix
// как обычная переписка. Файл крошечный, экономить на этом нечего.
function saveStateSoon() {
  return saveState();
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    await saveState();
    process.exit(0);
  });
}

/* ---------- пересылка в Planfix ---------- */

async function forwardRaw(update, why = 'без причины') {
  if (MODE !== 'webhook') return true;
  console.log(`→ в Planfix (${why}): ${(update?.message?.body?.text || '').slice(0, 60) || update?.update_type}`);
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

// Контакт человека в Planfix ищем по имени и запоминаем: список контактов
// не маленький, дёргать его на каждую заявку незачем.
const contactCache = new Map();

async function resolveContact(session) {
  const userId = session.user?.id;
  if (contactCache.has(userId)) return contactCache.get(userId);
  const name = session.user?.name;
  let contact = await findContact(name).catch((err) => {
    console.error('Поиск контакта не удался:', err.message);
    return null;
  });

  // Не нашли — заводим сами. Иначе задача будет ничья, а ответить человеку некуда.
  if (!contact && name) {
    contact = await createContact(name).catch((err) => {
      console.error(`Не удалось завести контакт «${name}»: ${err.message}`);
      return null;
    });
    if (contact) console.log(`Завёл контакт ${contact.id} для «${name}»`);
  }

  if (contact) contactCache.set(userId, contact);
  else console.error(`Контакт для «${name}» не найден и не создан — задача будет без заказчика.`);
  return contact;
}

/** Тянет файл из MAX и кладёт его в Planfix. Возвращает id файла или null. */
async function transferFile(file) {
  if (!file?.url) {
    console.error(`У вложения «${file?.name}» нет ссылки — пропускаю.`);
    return null;
  }
  try {
    const res = await fetch(file.url, { headers: { Authorization: TOKEN } });
    if (!res.ok) throw new Error(`MAX отдал ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const id = await uploadFile(buf, file.name);
    console.log(`  вложение «${file.name}» (${(buf.length / 1024).toFixed(0)} КБ) → файл Planfix ${id}`);
    return id;
  } catch (err) {
    console.error(`Вложение «${file.name}» не перенеслось: ${err.message}`);
    return null;
  }
}

/** Заявка становится ОТДЕЛЬНОЙ задачей в Planfix, вместе с файлами. */
async function createPlanfixTask(session) {
  const [priority] = priorityOf(session.answers.urgency);
  const contact = await resolveContact(session);

  const fileIds = [];
  for (const f of session.files || []) {
    const id = await transferFile(f);
    if (id) fileIds.push(id);
  }

  const id = await createTask({
    name: taskName({ ticketNo: session.ticketNo, priority, fields: session.answers }),
    description: summary(session).replace(/\n/g, '<br>'),
    contactId: contact?.id,
    fileIds,
    clinic: session.answers.clinic,
  });
  console.log(`${session.ticketNo} → задача Planfix ${id}` +
    `${contact ? `, контакт ${contact.id}` : ''}${fileIds.length ? `, файлов ${fileIds.length}` : ''}`);

  // Ставим задачу на присмотр: ответы инженера отсюда поедут обратно в MAX.
  if (id) {
    tickets.push({
      taskId: id,
      ticketNo: session.ticketNo,
      userId: session.user?.id,
      chatId: session.chatId || null,
      contactId: contact?.id || null,
      lastCommentId: 0,
      createdAt: Date.now(),
    });
    await saveTickets();
  }
  return id;
}

/* ---------- ответы инженеров обратно в MAX ---------- */

let tickets = [];

async function loadTickets() {
  try {
    const raw = JSON.parse(await readFile(TICKETS_FILE, 'utf8'));
    tickets = raw.filter((t) => Date.now() - t.createdAt < RELAY_DAYS * 864e5);
    if (tickets.length) console.log(`Под присмотром задач: ${tickets.length}`);
  } catch { /* ещё не было */ }
}

async function saveTickets() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(TICKETS_FILE, JSON.stringify(tickets, null, 1), 'utf8');
  } catch (err) { console.error('Не сохранил список задач:', err.message); }
}

async function relayOnce() {
  if (!planfixConfigured || !tickets.length) return;
  let changed = false;

  for (const t of tickets) {
    try {
      const fresh = await newComments(t.taskId, t.lastCommentId);
      for (const c of fresh) {
        t.lastCommentId = Math.max(t.lastCommentId, Number(c.id));
        changed = true;

        if (RELAY_MODE !== 'all' && !addressedToContact(c, t.contactId)) {
          console.log(`Комментарий ${c.id} по ${t.ticketNo} не адресован клиенту — не пересылаю.`);
          continue;
        }
        const text = String(c.description || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        if (!text) continue;

        const who = c.owner?.name || 'Техподдержка';
        await api.send({
          userId: t.userId, chatId: t.chatId,
          text: `Ответ по заявке ${t.ticketNo}\n${who}:\n\n${text}`,
          buttons: [],
        });
        console.log(`Ответ по ${t.ticketNo} доставлен в MAX (комментарий ${c.id}).`);
      }
    } catch (err) {
      console.error(`Не удалось забрать комментарии по ${t.ticketNo}: ${err.message}`);
    }
  }

  const before = tickets.length;
  tickets = tickets.filter((t) => Date.now() - t.createdAt < RELAY_DAYS * 864e5);
  if (changed || tickets.length !== before) await saveTickets();
}

/** Собранная заявка уходит как одно «сообщение пользователя» — задача создастся целиком. */
async function deliverTicket(session) {
  const card = summary(session);

  if (MODE !== 'webhook') {
    console.log(`\n─── ${session.ticketNo}: в Planfix ушло бы это ───\n${card}\n`);
    return true;
  }

  // Основной путь: отдельная задача через API. Прежняя пересылка в канал
  // остаётся страховкой — если API недоступен, заявка всё равно дойдёт.
  if (planfixConfigured) {
    try {
      await createPlanfixTask(session);
      return true;
    } catch (err) {
      console.error('Не удалось создать задачу через API, пересылаю в канал:', err.message);
    }
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
    if (!isStart) {
      return void (await forwardRaw(update,
        session ? 'переписка после заявки' : 'диалога нет'));
    }

    if (ev.kind === 'callback' && ev.callbackId) {
      await api.answerCallback(ev.callbackId).catch(() => {});
    }
    const fresh = createSession({ id: ev.userId, name: ev.userName });
    fresh.chatId = ev.chatId || null;
    fresh.pendingAttachments = [];
    sessions.set(ev.userId, fresh);
    await saveStateSoon();
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
  await saveStateSoon();
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
await loadTickets();
await registerCommands();

if (planfixConfigured) {
  setInterval(() => { relayOnce().catch((e) => console.error('Пересылка ответов:', e.message)); },
    RELAY_EVERY_MS).unref();
  console.log(`Ответы инженеров проверяю каждые ${RELAY_EVERY_MS / 1000} с, режим «${RELAY_MODE}».`);
}
if (MODE === 'webhook') runWebhook(); else await runPolling();
