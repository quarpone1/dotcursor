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
const MAX_PORT = 3496, PF_PORT = 3497, BOT_PORT = 3498, YT_PORT = 3495;
const STATE_DIR = join(ROOT, 'test', '.tmp-relay');

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const sentToUser = [];
let taskCreated = null;
let comments = [];          // что «написали» инженеры в задаче
let rateLimited = false;    // имитация исчерпанного суточного лимита Planfix
let tasksCreated = 0;
let changedList = 'auto';   // 'auto' — отдаём задачу 18001 как изменившуюся; 'error' — ломаем фильтр; массив — свои id
const listCalls = [];       // фильтры, с которыми бот спрашивал список
const posted = [];          // комментарии, которые бот отправил в задачу

const body = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  if (!/application\/json/.test(req.headers['content-type'] || '')) return { raw };
  try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
};

const maxUploads = [];       // что бот загрузил в MAX
const maxSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const b = await body(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (url.pathname === '/messages') { sentToUser.push(b); return res.end('{"message":{}}'); }
  if (url.pathname === '/uploads') {
    return res.end(JSON.stringify({ url: `http://127.0.0.1:${MAX_PORT}/upload.do?type=${url.searchParams.get('type')}` }));
  }
  if (url.pathname === '/upload.do') {
    maxUploads.push({ type: url.searchParams.get('type'), bytes: b.raw?.length || 0 });
    return res.end(url.searchParams.get('type') === 'image'
      ? JSON.stringify({ photos: { k: { token: 'IMG-TOKEN' } } })
      : JSON.stringify({ fileId: 1, token: 'FILE-TOKEN' }));
  }
  if (url.pathname === '/subscriptions') return res.end('{"subscriptions":[]}');
  res.end('{"result":"ok"}');
}).listen(MAX_PORT, '127.0.0.1');

const pfSrv = createServer(async (req, res) => {
  const b = await body(req);
  // Лимит Planfix отдаёт с кодом 200 и result:fail — ровно так, как в жизни
  if (rateLimited && !req.url.startsWith('/file/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: 'fail', code: 1, error: 'Rest API billing - rate limit exceeded, remaining:0, timeToReset:2' }));
  }
  // бинарные ответы — до общего JSON-заголовка
  if (req.url === '/file/555/download') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.alloc(2048, 7)); }
  if (req.url === '/file/556/download') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(Buffer.from('лог')); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/contact/list') {
    return res.end(JSON.stringify({ contacts: [{ id: 971, name: 'Дмитрий', lastname: 'Серов', isCompany: false }] }));
  }
  if (req.url === '/task/') { taskCreated = b; tasksCreated++; return res.end(JSON.stringify({ id: 18000 + tasksCreated })); }
  if (req.url === '/task/list') {
    listCalls.push(b.filters || []);
    if (changedList === 'error') return res.end(JSON.stringify({ result: 'fail', code: 1, error: 'bad filter' }));
    const ids = changedList === 'auto' ? [18001] : changedList;
    return res.end(JSON.stringify({ tasks: ids.map((id) => ({ id })) }));
  }
  if (/^\/task\/\d+\/comments\/list$/.test(req.url)) return res.end(JSON.stringify({ comments: req.url.includes('18001') ? comments : [] }));
  if (req.url === '/task/18001/comments/') { posted.push(b); return res.end(JSON.stringify({ id: 900 + posted.length })); }
  res.end('{"result":"success"}');
}).listen(PF_PORT, '127.0.0.1');

/* ---------- поддельный YouTrack ---------- */
const ytIssues = [];         // что бот создал в YouTrack
const ytComments = [];       // что бот написал в задачу YouTrack
const ytUploads = [];        // вложения, которые бот загрузил в YouTrack
let ytEngineerComments = []; // что «написали» инженеры в YouTrack
let ytDown = false;          // YouTrack недоступен (создание падает)
const ytQueries = [];
const ytSrv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const b = await body(req);
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/api/files/yt-1') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.alloc(1024, 3)); }
  if (url.pathname === '/api/admin/projects') return send(200, [{ id: '59-247', shortName: 'MIC', name: 'Сопровождение МИЦ' }]);
  if (url.pathname === '/api/issues' && req.method === 'POST') {
    if (ytDown) return send(503, { error: 'unavailable' });
    ytIssues.push(b);
    return send(200, { id: `2-${ytIssues.length}`, idReadable: `MIC-${ytIssues.length}` });
  }
  if (url.pathname === '/api/issues' && req.method === 'GET') {
    ytQueries.push(url.searchParams.get('query'));
    return send(200, ytIssues.map((_, i) => ({ id: `2-${i + 1}` })));
  }
  if (/^\/api\/issues\/[^/]+\/attachments$/.test(url.pathname)) { ytUploads.push({ issue: url.pathname.split('/')[3], bytes: b.raw?.length || 0 }); return send(200, [{ id: 'a1' }]); }
  if (/^\/api\/issues\/[^/]+\/comments$/.test(url.pathname) && req.method === 'POST') { ytComments.push({ issue: url.pathname.split('/')[3], ...b }); return send(200, { id: 'c-new' }); }
  if (/^\/api\/issues\/2-1\/comments$/.test(url.pathname)) return send(200, ytEngineerComments);
  if (/^\/api\/issues\/[^/]+\/comments$/.test(url.pathname)) return send(200, []);
  send(404, {});
}).listen(YT_PORT, '127.0.0.1');

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
    PLANFIX_RELAY_MIN_SECONDS: '1',
    PLANFIX_MIN_GAP_MS: '0',
    YOUTRACK_URL: `http://127.0.0.1:${YT_PORT}`,
    YOUTRACK_TOKEN: 'yt-token',
    YOUTRACK_PROJECT: 'MIC',
    YOUTRACK_MIN_GAP_MS: '0',
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
const lastButtons = () => JSON.stringify(sentToUser[sentToUser.length - 1]?.attachments || []);

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

  console.log('\n1а. Дубль заявки в YouTrack');
  check('задача создана и в YouTrack', ytIssues.length === 1, String(ytIssues.length));
  const ytf = Object.fromEntries((ytIssues[0]?.customFields || []).map((f) => [f.name, f.value?.name ?? f.value?.login ?? f.value]));
  check('в проекте MIC, с тем же номером заявки', ytIssues[0]?.project?.id === '59-247' && /^ТП-/.test(ytf['Номер заявки'] || ''), JSON.stringify(ytf));
  check('клиника и исполнитель по клинике (МедГород → deravchuk)', ytf['Клиника'] === 'МедГород' && ytf['Разработчик'] === 'deravchuk', JSON.stringify(ytf));
  check('тип и приоритет', ytf.Type === 'Bug' && ytf['Тип заявки'] === 'Ошибка' && ytf.Priority === 'Critical', JSON.stringify(ytf));
  check('описание — та же карточка заявки', /Не печатается чек/.test(ytIssues[0]?.description || ''));

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

  check('под ответом инженера есть кнопка «Ответить»', /reply:18001/.test(lastButtons()), lastButtons().slice(0, 80));

  console.log('\n3а. Опрос идёт через список изменившихся задач');
  const f = listCalls[listCalls.length - 1] || [];
  check('бот спрашивает «что изменилось» одним запросом', listCalls.length > 0);
  check('фильтр по дате изменения/комментария (type 79, gt, с временем)',
    f.some((x) => x.type === 79 && x.operator === 'gt' && x.value?.dateType === 'otherDate_withTime' && /^\d\d-\d\d-\d{4} \d\d:\d\d$/.test(x.value?.dateFrom || '')),
    JSON.stringify(f));
  check('и по проекту (type 5)', f.some((x) => x.type === 5 && x.value === 16521), JSON.stringify(f));

  console.log('\n3а-2. Задача не в списке изменившихся — не опрашивается');
  changedList = [];
  comments = [...comments, {
    id: 502, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Это НЕ должно прийти, пока фильтр молчит',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
  }];
  await sleep(1600);
  check('без сигнала об изменении комментарии не забираются',
    !sentToUser.some((m) => /НЕ должно прийти/.test(m.text || '')));
  changedList = 'auto';
  await sleep(1600);
  check('как только задача появилась в списке — доставлено',
    sentToUser.some((m) => /НЕ должно прийти/.test(m.text || '')));

  console.log('\n3а-3. Фильтр сломался — откат на порционный опрос');
  changedList = 'error';
  comments = [...comments, {
    id: 503, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Пришло через откат',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
  }];
  await sleep(1600);
  check('при ошибке списка бот всё равно доставил порционным опросом',
    sentToUser.some((m) => /Пришло через откат/.test(m.text || '')));
  check('и написал об откате в лог', logs.join('').includes('опрашиваю порцией'));
  changedList = 'auto';

  console.log('\n3б. Инженер прикладывает файлы');
  comments = [...comments, {
    id: 504, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Вот скрин и лог',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
    files: [{ id: 555, name: 'скрин.png', size: 2048 }, { id: 556, name: 'kassa.log', size: 3 }],
  }];
  const beforeFiles = sentToUser.length;
  await sleep(1800);
  const after = sentToUser.slice(beforeFiles);
  check('файлы скачаны из Planfix и загружены в MAX', maxUploads.length === 2,
    JSON.stringify(maxUploads));
  check('картинка ушла как image, лог как file',
    maxUploads.map((u) => u.type).join(',') === 'image,file', maxUploads.map((u) => u.type).join(','));
  const withImg = after.find((m) => JSON.stringify(m.attachments || []).includes('IMG-TOKEN'));
  const withFile = after.find((m) => JSON.stringify(m.attachments || []).includes('FILE-TOKEN'));
  check('картинка доставлена человеку вложением', Boolean(withImg) && /скрин\.png/.test(withImg.text), JSON.stringify(after.map((m) => m.text)));
  check('лог доставлен человеку вложением', Boolean(withFile) && /kassa\.log/.test(withFile.text));
  check('текст ответа пришёл отдельно и раньше файлов', /Вот скрин и лог/.test(after[0]?.text || ''), after[0]?.text);

  console.log('\n3в. Комментарий из одного файла, без текста');
  comments = [...comments, {
    id: 505, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: '',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
    files: [{ id: 556, name: 'kassa.log', size: 3 }],
  }];
  const beforeOnly = sentToUser.length;
  await sleep(1800);
  const onlyFile = sentToUser.slice(beforeOnly);
  check('файл без текста тоже доставлен', onlyFile.length === 2 && /файлы во вложении/.test(onlyFile[0].text),
    JSON.stringify(onlyFile.map((m) => m.text)));

  console.log('\n4. Повтор не дублируется');
  const count = sentToUser.length;
  await sleep(1600);
  check('тот же комментарий второй раз не отправлен', sentToUser.length === count,
    `было ${count}, стало ${sentToUser.length}`);

  console.log('\n5. Человек отвечает по кнопке');
  await post(btn('reply:18001'));
  check('режим ответа включён', /Пишу в заявку ТП-/.test(lastText()), lastText().slice(0, 40));
  await post(msg('Касса номер 3, у окна'));
  check('текст ушёл комментарием в задачу', posted.length === 1 && /Касса номер 3/.test(posted[0].description),
    JSON.stringify(posted[0]).slice(0, 120));
  check('комментарий помечен как из MAX', /Из MAX/.test(posted[0].description));
  check('владелец — контакт человека', posted[0].owner?.id === 'contact:971', JSON.stringify(posted[0].owner));
  check('человеку подтвердили отправку', /Отправлено в заявку/.test(lastText()), lastText().slice(0, 40));
  check('и продублирован в YouTrack', ytComments.length === 1 && /Касса номер 3/.test(ytComments[0].text) && /Из MAX/.test(ytComments[0].text),
    JSON.stringify(ytComments[0]).slice(0, 120));

  console.log('\n6. Свой комментарий не возвращается эхом');
  comments = [...comments, {
    id: 506, isDeleted: false, type: 'Comment',
    owner: { id: 'user:99', name: 'API' },
    description: '💬 Из MAX от Дмитрий Серов:<br>Касса номер 3, у окна',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
  }];
  const cnt = sentToUser.length;
  await sleep(1600);
  check('эха нет', sentToUser.length === cnt, `было ${cnt}, стало ${sentToUser.length}`);

  console.log('\n7. Мои заявки, выход и посторонний текст');
  await post(btn('reply:exit'));
  check('вышли из режима ответа', /Что дальше/.test(lastText()), lastText());
  await post(msg('просто текст'));
  check('вне режима текст не уходит в задачу', posted.length === 1, String(posted.length));
  check('и показано меню', /Что сделать/.test(lastText()) && /my:tickets/.test(lastButtons()));
  await post(btn('my:tickets'));
  check('список заявок показан', /Ваши заявки/.test(lastText()) && /pick:18001/.test(lastButtons()), lastButtons().slice(0, 100));
  await post(btn('pick:18001'));
  await post(msg('Ещё уточнение'));
  check('через список тоже можно писать', posted.length === 2 && /Ещё уточнение/.test(posted[1].description));

  console.log('\n7б. Сигнал от Planfix вместо опроса');
  // Останавливаем опрос: делаем задачу «неживой» невозможно, поэтому просто
  // шлём сигнал и проверяем доставку быстрее, чем прошёл бы тик.
  comments = [...comments, {
    id: 507, isDeleted: false, type: 'Comment',
    owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Готово, проверьте кассу',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] },
  }];
  const beforeHook = sentToUser.length;
  await fetch(`http://127.0.0.1:${BOT_PORT}/max-hook/secret/planfix`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 18001 }),
  });
  await sleep(350);
  check('по сигналу комментарий доставлен сразу, не дожидаясь опроса',
    sentToUser.slice(beforeHook).some((m) => /Готово, проверьте кассу/.test(m.text || '')),
    JSON.stringify(sentToUser.slice(beforeHook).map((m) => m.text)));
  const beforeDup = sentToUser.length;
  await sleep(1400);
  check('опрос после сигнала тот же комментарий не дублирует',
    !sentToUser.slice(beforeDup).some((m) => /Готово, проверьте кассу/.test(m.text || '')));
  await fetch(`http://127.0.0.1:${BOT_PORT}/max-hook/secret/planfix?task=99999`, { method: 'POST', body: '' });
  await sleep(200);
  check('сигнал по чужой задаче игнорируется', logs.join('').includes('не наша, пропускаю'));

  console.log('\n8. Суточный лимит Planfix исчерпан');
  rateLimited = true;
  const logLen = logs.length;
  await sleep(1600);
  check('бот заметил лимит и встал на паузу', logs.slice(logLen).join('').includes('Лимит API Planfix исчерпан'),
    logs.slice(logLen).join('').slice(0, 120));
  const pausedLog = logs.length;
  await sleep(1200);
  check('и не долбит API, пока пауза', !logs.slice(pausedLog).join('').includes('Не удалось забрать'),
    logs.slice(pausedLog).join('').slice(0, 120));

  const USER2 = 971002;
  const msg2 = (text) => ({ ...msg(text), message: { ...msg(text).message, sender: { user_id: USER2, name: 'Пётр Петров' }, recipient: { chat_id: 778, user_id: USER2 } } });
  const btn2 = (payload) => ({ ...btn(payload), callback: { ...btn(payload).callback, user: { user_id: USER2, name: 'Пётр Петров' } }, message: { ...btn(payload).message, recipient: { chat_id: 778, user_id: USER2 } } });
  const createdBefore = tasksCreated;
  await post(msg2('заявка'));
  await post(btn2('c:kind:1')); await post(btn2('c:clinic:2')); await post(btn2('c:module:2')); await post(btn2('c:role:1'));
  await post(msg2('Петров П. П. / логин 9'));
  await post(msg2('Добавить кнопку печати чека повторно'));
  await post(msg2('На экране кассы кнопка «Повторить чек» рядом с «Печать»'));
  await post(msg2('Сейчас переоткрываем смену, теряем время'));
  await post(btn2('c:urgency:2')); await post(msg2('+7 900 111-22-33')); await post(btn2('files:done'));
  await post(btn2('ok:send'));
  await sleep(300);
  check('во время паузы задача не создавалась', tasksCreated === createdBefore, String(tasksCreated - createdBefore));
  check('человеку сказано, что заявка сохранена и подождёт',
    sentToUser.some((m) => /Заявка принята и сохранена/.test(m.text || '')));

  rateLimited = false;
  await sleep(3200);   // сброс через 2 с + следующий тик
  check('после сброса заявка из очереди создана', tasksCreated === createdBefore + 1, String(tasksCreated - createdBefore));
  check('это доработка с полями из очереди', taskCreated?.name?.includes('Доработка') && /повторно/.test(taskCreated?.name || ''), taskCreated?.name);
  check('человек уведомлён, что заявка передана',
    sentToUser.some((m) => /передана в поддержку/.test(m.text || '')));

  console.log('\n9. Инженер отвечает из YouTrack');
  const ytBefore = sentToUser.length;
  const ytUploadsBefore = maxUploads.length;
  ytEngineerComments = [
    { id: 'y1', text: `💬 Из MAX от Дмитрий Серов:\nКасса номер 3, у окна`, created: Date.now() - 1000, deleted: false, author: { login: 'figol_rs', fullName: 'Фиголь Роман' } },
    { id: 'y2', text: 'Проверьте драйвер, версия 2.1', created: Date.now(), deleted: false, author: { login: 'kasimov_dv', fullName: 'Касимов Дмитрий' },
      attachments: [{ id: 'yt-1', name: 'драйвер.png', url: '/api/files/yt-1', size: 1024 }] },
  ];
  await sleep(1800);
  const fromYt = sentToUser.slice(ytBefore);
  const ytReply = fromYt.find((m) => /Проверьте драйвер/.test(m.text || ''));
  check('ответ из YouTrack доставлен в MAX', Boolean(ytReply), JSON.stringify(fromYt.map((m) => m.text)));
  check('видно, что это YouTrack и по какой заявке', /Ответ по заявке ТП-.*\(YouTrack MIC-1\)/.test(ytReply?.text || ''), ytReply?.text?.slice(0, 60));
  check('указан автор', /Касимов Дмитрий/.test(ytReply?.text || ''));
  check('кнопка «Ответить» под ответом', /reply:18001/.test(JSON.stringify(ytReply?.attachments || [])));
  check('свой комментарий (из MAX) эхом не вернулся', !fromYt.some((m) => /Касса номер 3/.test(m.text || '')));
  check('вложение скачано из YouTrack и загружено в MAX', maxUploads.length === ytUploadsBefore + 1, String(maxUploads.length - ytUploadsBefore));
  check('вложение доставлено человеку', fromYt.some((m) => /драйвер\.png/.test(m.text || '') && JSON.stringify(m.attachments || []).includes('TOKEN')));
  check('опрос YouTrack идёт запросом «что изменилось»', ytQueries.some((q) => /project: MIC updated: \d{4}-/.test(q || '')), ytQueries.at(-1));
  const cnt9 = sentToUser.length;
  await sleep(1500);
  check('повтор не дублируется', sentToUser.length === cnt9, `было ${cnt9}, стало ${sentToUser.length}`);

  console.log('\n9а. Ответ человека уходит в обе системы с файлом');
  await post(btn('reply:18001'));
  const ytCommentsBefore = ytComments.length; const postedBefore = posted.length;
  await post(msg('Обновил драйвер, не помогло'));
  check('в Planfix', posted.length === postedBefore + 1 && /Обновил драйвер/.test(posted.at(-1).description));
  check('в YouTrack', ytComments.length === ytCommentsBefore + 1 && /Обновил драйвер/.test(ytComments.at(-1).text));
  check('в YouTrack — в ту же задачу', ytComments.at(-1).issue === '2-1', ytComments.at(-1).issue);

  console.log('\n10. YouTrack недоступен — Planfix не страдает, дубль доделывается позже');
  ytDown = true;
  const USER3 = 971003;
  const msg3 = (text) => ({ ...msg(text), message: { ...msg(text).message, sender: { user_id: USER3, name: 'Анна Иванова' }, recipient: { chat_id: 779, user_id: USER3 } } });
  const btn3 = (payload) => ({ ...btn(payload), callback: { ...btn(payload).callback, user: { user_id: USER3, name: 'Анна Иванова' } }, message: { ...btn(payload).message, recipient: { chat_id: 779, user_id: USER3 } } });
  const pfBefore10 = tasksCreated, ytBefore10 = ytIssues.length;
  await post(msg3('заявка'));
  await post(btn3('c:kind:0')); await post(btn3('c:clinic:1')); await post(btn3('c:module:0')); await post(btn3('c:role:0'));
  await post(msg3('Иванова А. А. / логин 5')); await post(btn3('skip'));
  await post(msg3('Не открывается расписание')); await post(msg3('1. Открыть расписание')); await post(msg3('Белый экран')); await post(msg3('Расписание'));
  await post(btn3('c:urgency:1')); await post(msg3('+7 900 222-33-44')); await post(btn3('files:done'));
  await post(btn3('ok:send'));
  await sleep(400);
  check('задача в Planfix создана несмотря на сбой YouTrack', tasksCreated === pfBefore10 + 1, String(tasksCreated - pfBefore10));
  check('в YouTrack пока нет', ytIssues.length === ytBefore10);
  check('человеку сказано, что заявка передана', sentToUser.some((m) => /передана в поддержку/.test(m.text || '')));
  check('в логе — повторю позже', logs.join('').includes('повторю позже'));
  ytDown = false;
  await sleep(1800);
  check('после восстановления дубль создан', ytIssues.length === ytBefore10 + 1, String(ytIssues.length - ytBefore10));
  const ytf10 = Object.fromEntries((ytIssues.at(-1)?.customFields || []).map((f) => [f.name, f.value?.name ?? f.value?.login ?? f.value]));
  check('с полями из снимка заявки (Нефтяник стационар → kasimov_dv, Major)', ytf10['Клиника'] === 'Нефтяник стационар' && ytf10['Разработчик'] === 'kasimov_dv' && ytf10.Priority === 'Major', JSON.stringify(ytf10));
} finally {
  bot.kill();
  maxSrv.close();
  pfSrv.close();
  ytSrv.close();
  await sleep(150);
  await rm(STATE_DIR, { recursive: true, force: true });
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nОбратный канал работает в обе стороны');
process.exit(failed ? 1 : 0);
