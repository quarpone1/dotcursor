// Модуль YouTrack на поддельном API: поля, исполнитель, откат по отвергнутому
// полю, комментарии, вложения, запрос «что изменилось».
// Запуск: npm run youtrack:test
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3499;
process.env.YOUTRACK_URL = `http://127.0.0.1:${PORT}`;
process.env.YOUTRACK_TOKEN = 'yt-token';
process.env.YOUTRACK_PROJECT = 'MIC';
process.env.YOUTRACK_MIN_GAP_MS = '0';

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const created = [];
const comments = [];
const uploads = [];
let rejectField = null;         // имя поля, которое «не в проекте»
let rejectAssignee = false;
const queries = [];
const COMMENTS = [
  { id: 'c1', text: '💬 Из MAX от Иванов:\nмой вопрос', created: 1000, deleted: false, author: { login: 'figol_rs', fullName: 'Фиголь Роман' } },
  { id: 'c2', text: 'Смотрю логи', created: 2000, deleted: false, author: { login: 'kasimov_dv', fullName: 'Касимов Дмитрий' }, attachments: [{ id: 'a1', name: 'лог.txt', url: '/api/files/a1' }] },
  { id: 'c3', text: 'удалён', created: 3000, deleted: true, author: { login: 'kasimov_dv' } },
  { id: 'c4', text: 'Готово, проверьте', created: 4000, deleted: false, author: { login: 'kasimov_dv', fullName: 'Касимов Дмитрий' } },
];

const srv = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const isJson = /application\/json/.test(req.headers['content-type'] || '');
  const body = raw.length && isJson ? JSON.parse(raw.toString('utf8')) : {};
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (url.pathname === '/api/admin/projects') return send(200, [{ id: '59-247', shortName: 'MIC', name: 'Сопровождение МИЦ' }]);
  if (url.pathname === '/api/issues' && req.method === 'POST') {
    const names = (body.customFields || []).map((f) => f.name);
    if (rejectField && names.includes(rejectField)) return send(500, { error: 'server_error', error_description: `incompatible-issue-custom-field-name-${rejectField}` });
    if (rejectAssignee && names.includes('Разработчик')) return send(400, { error: '', error_description: 'Недопустимое значение' });
    const noVal = (body.customFields || []).find((f) => f.value?.name === 'Срочно-срочно');
    if (noVal) return send(400, { error: '', error_description: `Сущность типа ${noVal.value.name} с указанным именем ({1}) не найдена` });
    created.push(body);
    return send(200, { id: `2-${created.length}`, idReadable: `MIC-${created.length}` });
  }
  if (url.pathname === '/api/issues' && req.method === 'GET') {
    queries.push(url.searchParams.get('query'));
    return send(200, [{ id: '2-1' }, { id: '2-7' }]);
  }
  if (/^\/api\/issues\/[^/]+\/attachments$/.test(url.pathname)) { uploads.push(req.headers['content-type']); return send(200, [{ id: 'a9', name: 'f' }]); }
  if (/^\/api\/issues\/[^/]+\/comments$/.test(url.pathname) && req.method === 'POST') { comments.push(body); return send(200, { id: 'c9' }); }
  if (/^\/api\/issues\/[^/]+\/comments$/.test(url.pathname)) return send(200, COMMENTS);
  if (url.pathname === '/api/files/a1') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('LOGDATA'); }
  send(404, {});
}).listen(PORT, '127.0.0.1');
await sleep(80);

const yt = await import('../bot/youtrack.mjs');

try {
  console.log('\n1. Проект');
  const p = await yt.loadProject();
  check('проект найден по короткому имени', p.id === '59-247');

  console.log('\n2. Задача со всеми полями');
  const fields = { kind: 'Ошибка', clinic: 'ГП-1', module: 'Касса', role: 'Кассир', patient: 'А-1, КБП 3', urgency: 'Блокирует работу (полный отказ)', contact: '+7 900' };
  const iss = await yt.createIssue({ summary: 'тест', description: 'карточка', fields, ticketNo: 'ТП-2026-1' });
  check('возвращает id и читаемый номер', iss.id === '2-1' && iss.key === 'MIC-1', JSON.stringify(iss));
  const cf = Object.fromEntries(created[0].customFields.map((f) => [f.name, f.value?.name ?? f.value?.login ?? f.value]));
  check('клиника, тип, срочность — списками', cf['Клиника'] === 'ГП-1' && cf['Тип заявки'] === 'Ошибка' && cf['Срочность'] === 'Блокирует работу (полный отказ)', JSON.stringify(cf));
  check('Type и Priority по соответствию', cf.Type === 'Bug' && cf.Priority === 'Critical', `${cf.Type}/${cf.Priority}`);
  check('строковые поля', cf['Номер заявки'] === 'ТП-2026-1' && cf['Модуль'] === 'Касса' && cf['Роль'] === 'Кассир' && cf['Пациент'] === 'А-1, КБП 3' && cf['Источник'] === 'бот MAX');
  check('исполнитель по клинике — Щербаков', cf['Разработчик'] === 'shcherbakov_eg', cf['Разработчик']);
  check('проект подставлен', created[0].project.id === '59-247');

  await yt.createIssue({ summary: 'д', description: 'x', fields: { kind: 'Доработка', clinic: 'МедГород', urgency: 'Незначительно / пожелание' }, ticketNo: 'ТП-2026-2' });
  const cf2 = Object.fromEntries(created[1].customFields.map((f) => [f.name, f.value?.name ?? f.value?.login ?? f.value]));
  check('доработка → Feature/Minor, МедГород → Деравчук', cf2.Type === 'Feature' && cf2.Priority === 'Minor' && cf2['Разработчик'] === 'deravchuk', JSON.stringify(cf2));
  check('незнакомая клиника — без исполнителя', !(await (async () => { await yt.createIssue({ summary: 'x', description: 'x', fields: { clinic: 'Нет такой' } }); return created[2].customFields.some((f) => f.name === 'Разработчик'); })()));

  console.log('\n3. Отвергнутое поле не роняет заявку');
  rejectField = 'Роль';
  const before = created.length;
  const r = await yt.createIssue({ summary: 'x', description: 'x', fields, ticketNo: 'ТП-2026-3' });
  check('задача создана после отката', r.id && created.length === before + 1);
  check('без отвергнутого поля, но с остальными', !created.at(-1).customFields.some((f) => f.name === 'Роль') && created.at(-1).customFields.some((f) => f.name === 'Клиника'));
  rejectField = null;
  rejectAssignee = true;
  await yt.createIssue({ summary: 'x', description: 'x', fields, ticketNo: 'ТП-2026-4' });
  check('инженер вне команды — задача без исполнителя, поля целы', !created.at(-1).customFields.some((f) => f.name === 'Разработчик') && created.at(-1).customFields.some((f) => f.name === 'Клиника'));
  rejectAssignee = false;
  await yt.createIssue({ summary: 'x', description: 'x', fields: { ...fields, urgency: 'Срочно-срочно' }, ticketNo: 'ТП-2026-5' });
  const cf5 = Object.fromEntries(created.at(-1).customFields.map((f) => [f.name, f.value?.name ?? f.value?.login ?? f.value]));
  check('значения нет в списке — поле выброшено, остальные целы', !('Срочность' in cf5) && cf5['Клиника'] === 'ГП-1' && cf5['Разработчик'] === 'shcherbakov_eg', JSON.stringify(cf5));

  console.log('\n4. Комментарии и файлы');
  const fresh = await yt.newComments('2-1', 0);
  check('наш комментарий (с меткой) не считается ответом', !fresh.some((c) => c.id === 'c1'));
  check('удалённый пропущен', !fresh.some((c) => c.id === 'c3'));
  check('ответы инженера взяты по порядку', fresh.map((c) => c.id).join(',') === 'c2,c4', fresh.map((c) => c.id).join(','));
  const later = await yt.newComments('2-1', 2000);
  check('после отметки времени — только новее', later.map((c) => c.id).join(',') === 'c4');
  check('вложение комментария доезжает', fresh[0].attachments?.[0]?.name === 'лог.txt');
  const buf = await yt.downloadAttachment('/api/files/a1');
  check('вложение скачивается по относительной ссылке', buf.toString() === 'LOGDATA');
  await yt.addComment('2-1', `${yt.FROM_MAX_MARK} от Иванов:\nответ`);
  check('комментарий уходит с меткой', /^💬 Из MAX/.test(comments[0].text));
  await yt.uploadAttachment('2-1', Buffer.from('x'), 'скрин.png');
  check('файл уходит multipart', /multipart\/form-data/.test(uploads[0] || ''));

  console.log('\n5. Что изменилось');
  const set = await yt.changedIssuesSince(Date.now() - 60000);
  check('возвращает множество id', set.has('2-1') && set.has('2-7'));
  check('запрос с проектом и датой-временем', /project: MIC updated: \d{4}-\d\d-\d\dT\d\d:\d\d \.\. \*/.test(queries.at(-1) || ''), queries.at(-1));
} finally {
  srv.close();
}
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nМодуль YouTrack работает');
process.exit(failed ? 1 : 0);
