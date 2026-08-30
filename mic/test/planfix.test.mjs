// Проверка создания задач в Planfix на поддельном REST API.
// Запуск: npm run planfix:test
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3495;
process.env.PLANFIX_API_TOKEN = 'test-token';
process.env.PLANFIX_API_BASE = `http://127.0.0.1:${PORT}`;
process.env.PLANFIX_PROJECT_ID = '4242';

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

// Контакты как в жизни: имя и фамилия врозь, есть компании и однофамильцы
const CONTACTS = [
  { id: 5, name: 'ГП1', lastname: '', isCompany: true },
  { id: 900, name: 'Дмитрий', lastname: 'Касимов', isCompany: false },
  { id: 971, name: 'Дмитрий', lastname: 'Серов', isCompany: false },
  { id: 980, name: 'Анна', lastname: 'Халидуллина', isCompany: false },
];

const created = [];
const uploaded = [];

// Комментарии как в жизни: карточка от контакта, реплики сотрудников,
// удалённый и адресованный лично клиенту.
const COMMENTS = [
  { id: 100, isDeleted: false, type: 'None', owner: { id: 'contact:971', name: 'Серов' },
    description: 'Заявка ТП-2026-1 ...' },
  { id: 101, isDeleted: false, type: 'Comment', owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Внутреннее: посмотрю логи',
    recipients: { users: [{ id: 'user:63', name: 'Щербаков' }] } },
  { id: 102, isDeleted: false, type: 'Comment', owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'Уточните, пожалуйста, номер кассы',
    recipients: { users: [{ id: 'contact:971', name: 'Серов' }] } },
  { id: 103, isDeleted: true, type: 'Comment', owner: { id: 'user:27', name: 'Фиголь Роман' },
    description: 'удалённый' },
];
const srv = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const isJson = /application\/json/.test(req.headers['content-type'] || '');
  const body = raw.length && isJson ? JSON.parse(raw.toString('utf8')) : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });

  if (req.url === '/contact/list') {
    const page = CONTACTS.slice(body.offset || 0, (body.offset || 0) + (body.pageSize || 100));
    return res.end(JSON.stringify({ result: 'success', contacts: page }));
  }
  if (req.url === '/task/') {
    created.push(body);
    return res.end(JSON.stringify({ result: 'success', id: 17000 + created.length }));
  }
  if (req.url === '/file/') {
    uploaded.push(req.headers['content-type'] || '');
    return res.end(JSON.stringify({ result: 'success', id: 969000 + uploaded.length }));
  }
  if (req.url === '/task/17001/comments/list') {
    return res.end(JSON.stringify({ result: 'success', comments: COMMENTS }));
  }
  res.end('{}');
}).listen(PORT, '127.0.0.1');

await sleep(100);
const { findContact, createTask, taskName, uploadFile, newComments, addressedToContact } =
  await import('../bot/planfix.mjs');

try {
  console.log('\n1. Поиск контакта по имени из MAX');
  const exact = await findContact('Дмитрий Серов');
  check('нашёлся нужный Дмитрий, а не однофамилец', exact?.id === 971, `id=${exact?.id}`);

  const reversed = await findContact('Серов Дмитрий');
  check('порядок «фамилия имя» тоже понимается', reversed?.id === 971, `id=${reversed?.id}`);

  const other = await findContact('Анна Халидуллина');
  check('другой человек — другой контакт', other?.id === 980, `id=${other?.id}`);

  const missing = await findContact('Петров Пётр');
  check('незнакомое имя не подставляет случайный контакт', missing === null, JSON.stringify(missing));

  const company = await findContact('ГП1');
  check('компания не выдаётся за человека', company === null, JSON.stringify(company));

  console.log('\n2. Создание задачи');
  const id = await createTask({
    name: 'тест', description: 'карточка', contactId: 971,
  });
  check('задача создана и вернула id', id === 17001, String(id));

  const body = created[0];
  check('заказчик — контакт человека', body.counterparty?.id === 'contact:971', JSON.stringify(body.counterparty));
  check('автор — тот же контакт', body.assigner?.id === 'contact:971', JSON.stringify(body.assigner));
  check('исполнители проставлены', (body.assignees?.users || []).length === 4,
    JSON.stringify(body.assignees));
  check('шаблон как у задач канала', body.template?.id === 1, JSON.stringify(body.template));
  check('задача кладётся в заданный проект', body.project?.id === 4242, JSON.stringify(body.project));

  console.log('\n3. Задача без контакта');
  await createTask({ name: 'ничья', description: 'x', contactId: null });
  const bare = created[1];
  check('без контакта поля заказчика нет', !bare.counterparty && !bare.assigner,
    JSON.stringify({ c: bare.counterparty, a: bare.assigner }));
  check('но исполнители всё равно назначены', (bare.assignees?.users || []).length === 4);

  console.log('\n4. Заголовок задачи');
  const nm = taskName({
    ticketNo: 'ТП-2026-5338',
    priority: 'P0/P1 — критично',
    fields: { clinic: 'МедГород', module: 'ЭМК', title: 'Не печатается чек на кассе' },
  });
  check('в заголовке номер, приоритет, клиника и суть',
    /^\[ТП-2026-5338\] P0\/P1 — критично · МедГород \/ ЭМК — Не печатается чек/.test(nm), nm);

  const long = taskName({
    ticketNo: 'ТП-2026-1', priority: 'P2',
    fields: { clinic: 'К', module: 'М', title: 'о'.repeat(300) },
  });
  check('длинный заголовок обрезается', long.length <= 250, `${long.length} символов`);
  console.log('\n5. Файлы');
  const fileId = await uploadFile(Buffer.from('123'), 'скрин.png');
  check('файл загружается и возвращает id', fileId === 969001, String(fileId));
  check('уходит как multipart', /multipart\/form-data/.test(uploaded[0] || ''), uploaded[0]);

  await createTask({ name: 'с файлом', description: 'x', contactId: 971, fileIds: [fileId] });
  const withFile = created[created.length - 1];
  check('файл прицеплен к задаче', JSON.stringify(withFile.files) === JSON.stringify([{ id: 969001 }]),
    JSON.stringify(withFile.files));

  console.log('\n6. Ответы инженеров');
  const fresh = await newComments(17001, 0);
  check('карточка заявки не считается ответом', !fresh.some((c) => c.id === 100));
  check('удалённый комментарий пропущен', !fresh.some((c) => c.id === 103));
  check('реплики сотрудника взяты', fresh.map((c) => c.id).join(',') === '101,102',
    fresh.map((c) => c.id).join(','));

  const seenAlready = await newComments(17001, 101);
  check('уже отправленное второй раз не берётся', seenAlready.map((c) => c.id).join(',') === '102',
    seenAlready.map((c) => c.id).join(','));

  check('внутренняя переписка клиенту не адресована',
    addressedToContact(COMMENTS[1], 971) === false);
  check('комментарий клиенту распознаётся',
    addressedToContact(COMMENTS[2], 971) === true);
  check('без адресатов считается общим',
    addressedToContact({ description: 'x' }, 971) === true);
} finally {
  srv.close();
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nЗадачи в Planfix создаются верно');
process.exit(failed ? 1 : 0);
