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
         uploadFile, newComments, addressedToContact, createContact,
         addComment, isOwnComment, FROM_MAX_MARK } from './planfix.mjs';
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
// Сколько дней после последней активности опрашиваем задачу на ответы инженера
const RELAY_DAYS = Number(process.env.PLANFIX_RELAY_DAYS || 14);
// Сколько дней задача остаётся в «Моих заявках» и принимает ответы человека
const TICKETS_KEEP_DAYS = Number(process.env.TICKETS_KEEP_DAYS || 180);
const REPLIES_FILE = join(STATE_DIR, 'bot-replies.json');
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

const START_RE = /^\/?(start|старт|начать|начало|заявка|новая заявка|help|помощь|\?)$/i;
const LIST_RE = /^\/?(tickets|мои заявки|заявки|мои)$/i;

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
      title: String(session.answers.title || '').slice(0, 40),
      userId: session.user?.id,
      chatId: session.chatId || null,
      contactId: contact?.id || null,
      lastCommentId: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
    await saveTickets();
  }
  return id;
}

/* ---------- ответы инженеров обратно в MAX ---------- */

let tickets = [];

const keepTicket = (t) => Date.now() - (t.createdAt || 0) < TICKETS_KEEP_DAYS * 864e5;
const isLive = (t) => Date.now() - (t.lastActivity || t.createdAt || 0) < RELAY_DAYS * 864e5;

async function loadTickets() {
  try {
    const raw = JSON.parse(await readFile(TICKETS_FILE, 'utf8'));
    tickets = raw.filter(keepTicket);
    if (tickets.length) console.log(`Задач в памяти: ${tickets.length}, под присмотром: ${tickets.filter(isLive).length}`);
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

  for (const t of tickets.filter(isLive)) {
    try {
      const fresh = await newComments(t.taskId, t.lastCommentId);
      for (const c of fresh) {
        t.lastCommentId = Math.max(t.lastCommentId, Number(c.id));
        changed = true;

        // Наш собственный комментарий (ответ человека из MAX) — не эхо
        if (isOwnComment(c)) continue;

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
          buttons: [[{ text: '💬 Ответить', payload: `reply:${t.taskId}` }]],
        });
        t.lastActivity = Date.now();
        console.log(`Ответ по ${t.ticketNo} доставлен в MAX (комментарий ${c.id}).`);
      }
    } catch (err) {
      console.error(`Не удалось забрать комментарии по ${t.ticketNo}: ${err.message}`);
    }
  }

  const before = tickets.length;
  tickets = tickets.filter(keepTicket);
  if (changed || tickets.length !== before) await saveTickets();
}

/* ---------- ответы человека по своим заявкам ---------- */

// userId → {taskId, ticketNo}. Пока режим включён, всё, что пишет человек,
// уходит комментарием в эту задачу — до «Готово» или выбора другой заявки.
let replies = new Map();

async function loadReplies() {
  try {
    replies = new Map(Object.entries(JSON.parse(await readFile(REPLIES_FILE, 'utf8')))
      .map(([k, v]) => [Number(k), v]));
  } catch { /* ещё не было */ }
}
async function saveReplies() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(REPLIES_FILE, JSON.stringify(Object.fromEntries(replies), null, 1), 'utf8');
  } catch (err) { console.error('Не сохранил режимы ответа:', err.message); }
}

const MENU = [[{ text: '📝 Новая заявка', payload: 'new:ticket' }, { text: '📋 Мои заявки', payload: 'my:tickets' }]];
const REPLY_BTNS = (taskId) => [[{ text: '✓ Готово', payload: 'reply:exit' }, { text: '📋 Другая заявка', payload: 'my:tickets' }]];

function myTickets(userId) {
  return tickets.filter((t) => t.userId === userId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
}

function ticketsMenu(userId) {
  const mine = myTickets(userId);
  if (!mine.length) {
    return { text: 'У вас пока нет отправленных заявок.', buttons: [[{ text: '📝 Новая заявка', payload: 'new:ticket' }]] };
  }
  const rows = mine.map((t) => [{
    text: `${t.ticketNo}${t.title ? ' · ' + t.title : ''}`.slice(0, 40),
    payload: `pick:${t.taskId}`,
  }]);
  rows.push([{ text: '📝 Новая заявка', payload: 'new:ticket' }]);
  return { text: 'Ваши заявки — выберите, по какой хотите написать:', buttons: rows };
}

async function enterReply(ev, taskId) {
  const t = tickets.find((x) => x.taskId === Number(taskId) && x.userId === ev.userId);
  if (!t) {
    await reply(ev, [{ text: 'Эта заявка не найдена среди ваших.', buttons: MENU }]);
    return;
  }
  replies.set(ev.userId, { taskId: t.taskId, ticketNo: t.ticketNo, since: Date.now() });
  await saveReplies();
  await reply(ev, [{
    text: `Пишу в заявку ${t.ticketNo}${t.title ? ' · ' + t.title : ''}.\n` +
          'Отправьте текст или файл — он уйдёт инженеру в эту задачу.\n' +
          'Когда закончите, нажмите «Готово».',
    buttons: REPLY_BTNS(t.taskId),
  }]);
}

async function exitReply(ev) {
  replies.delete(ev.userId);
  await saveReplies();
  await reply(ev, [{ text: 'Хорошо. Что дальше?', buttons: MENU }]);
}

/** Текст или файл человека → комментарий в его задаче. */
async function postReply(ev, mode) {
  const t = tickets.find((x) => x.taskId === mode.taskId);
  if (!t) { await exitReply(ev); return; }

  const fileIds = [];
  for (const f of ev.attachments || []) {
    const id = await transferFile(f);
    if (id) fileIds.push(id);
  }
  const said = (ev.text || '').trim();
  const body = said || (fileIds.length ? `прислал файл${fileIds.length > 1 ? 'ы' : ''}` : '');
  if (!body) {
    await reply(ev, [{ text: 'Не увидел ни текста, ни файла.', buttons: REPLY_BTNS(t.taskId) }]);
    return;
  }

  try {
    await addComment(t.taskId, `${FROM_MAX_MARK} от ${ev.userName || 'пользователя'}:\n${body}`,
      { contactId: t.contactId, fileIds });
    t.lastActivity = Date.now();
    await saveTickets();
    console.log(`${t.ticketNo} ← ответ человека (${fileIds.length} файл.)`);
    await reply(ev, [{
      text: `Отправлено в заявку ${t.ticketNo}. Можно написать ещё или нажать «Готово».`,
      buttons: REPLY_BTNS(t.taskId),
    }]);
  } catch (err) {
    console.error(`Не удалось добавить комментарий в ${t.ticketNo}: ${err.message}`);
    await reply(ev, [{
      text: 'Не получилось передать сообщение в заявку. Попробуйте ещё раз чуть позже.',
      buttons: REPLY_BTNS(t.taskId),
    }]);
  }
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
    const payload = ev.kind === 'callback' ? String(ev.payload || '') : '';
    if (ev.kind === 'callback' && ev.callbackId) {
      await api.answerCallback(ev.callbackId).catch(() => {});
    }

    // Кнопки управления вне диалога
    if (payload === 'my:tickets' || (ev.kind === 'text' && LIST_RE.test(said))) {
      return void (await reply(ev, [ticketsMenu(ev.userId)]));
    }
    if (payload.startsWith('pick:') || payload.startsWith('reply:')) {
      const arg = payload.split(':')[1];
      return void (arg === 'exit' ? await exitReply(ev) : await enterReply(ev, arg));
    }

    const isStart =
      ev.kind === 'start' ||
      !session ||                                   // первое обращение
      payload === 'new:ticket' ||
      (ev.kind === 'text' && START_RE.test(said));

    if (!isStart) {
      // Человек в режиме ответа по заявке — его слова уходят в ту задачу
      const mode = replies.get(ev.userId);
      if (mode && (ev.kind === 'text' || ev.kind === 'attachment')) {
        return void (await postReply(ev, mode));
      }
      // Иначе просто подсказываем, что можно сделать
      return void (await reply(ev, [{ text: 'Что сделать?', buttons: MENU }]));
    }

    replies.delete(ev.userId);   // новая заявка закрывает режим ответа
    await saveReplies();
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

  // Кнопка из старого сообщения («Ответить», «Мои заявки») посреди опроса
  if (ev.kind === 'callback' && /^(reply|pick|my):/.test(String(ev.payload || ''))) {
    await api.answerCallback(ev.callbackId).catch(() => {});
    await reply(ev, [{ text: 'Сначала закончите или отмените текущую заявку.', buttons: [] }]);
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
    console.error('Сбой диалога:', err.message);
    sessions.delete(ev.userId);
    await reply(ev, [{ text: 'Что-то пошло не так, заявку придётся начать заново.', buttons: MENU }]);
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
      text: 'Ответы инженера придут сюда. Дописать что-то к заявке можно через «Мои заявки».',
      buttons: MENU,
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
    { name: 'tickets', description: 'Мои заявки — дописать или ответить' },
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
await loadReplies();
await registerCommands();

if (planfixConfigured) {
  setInterval(() => { relayOnce().catch((e) => console.error('Пересылка ответов:', e.message)); },
    RELAY_EVERY_MS).unref();
  console.log(`Ответы инженеров проверяю каждые ${RELAY_EVERY_MS / 1000} с, режим «${RELAY_MODE}».`);
}
if (MODE === 'webhook') runWebhook(); else await runPolling();
