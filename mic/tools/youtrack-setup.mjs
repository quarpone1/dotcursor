// Настройка YouTrack под схему «клиники видят свои задачи в MIC»:
//   1. роль «Клиент МИЦ» — читать задачи и комментарии, комментировать,
//      прикладывать файлы; без изменения полей, статусов и удаления;
//   2. группы «Клиенты … (объект)» по каждой клинике из ticket.mjs
//      (CLINIC_GROUP), привязанные к проекту MIC, с этой ролью в MIC;
//   3. существующим задачам MIC — видимость «группа клиники + команда».
// Людей в группы не добавляет — это делает администратор.
// Повторный запуск ничего не дублирует. Запуск: npm run youtrack:setup
import { CLINIC_GROUP } from '../ticket.mjs';

const Y = (process.env.YOUTRACK_URL || '').replace(/\/+$/, '');
if (!Y || !process.env.YOUTRACK_TOKEN) { console.error('Нужны YOUTRACK_URL и YOUTRACK_TOKEN в .env'); process.exit(1); }
const PROJECT = process.env.YOUTRACK_PROJECT || 'MIC';
const H = { Authorization: 'Bearer ' + process.env.YOUTRACK_TOKEN, Accept: 'application/json', 'Content-Type': 'application/json' };
const call = async (m, p, b) => {
  const r = await fetch(Y + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t.slice(0, 200)}`);
  return j;
};
// Проект и его команда — по короткому имени, а не по зашитым id.
const ytProject = (await call('GET', `/api/admin/projects?fields=id,shortName,name,team(id,name)&query=${encodeURIComponent(PROJECT)}`)).find((p) => p.shortName === PROJECT);
if (!ytProject) { console.error(`Проект ${PROJECT} не найден`); process.exit(1); }
const hubProject = ((await call('GET', '/hub/api/rest/projects?fields=id,key&$top=500')).projects || []).find((p) => p.key === PROJECT);
if (!hubProject) { console.error(`Проект ${PROJECT} не найден в Hub`); process.exit(1); }
const MIC_HUB = hubProject.id;
const TEAM_YT = ytProject.team?.id || (await call('GET', '/api/groups?fields=id,name&$top=500')).find((g) => g.name === `${ytProject.name} Team`)?.id;
if (!TEAM_YT) { console.error('Команда проекта не найдена — видимость ставить нельзя'); process.exit(1); }
const PARENT = ((await call('GET', '/hub/api/rest/usergroups?fields=id,name&$top=500')).usergroups || []).find((g) => g.name === 'Все пользователи')?.id;
console.log(`Проект ${PROJECT} «${ytProject.name}», команда ${TEAM_YT}, родитель групп ${PARENT ? 'найден' : 'НЕ найден'}`);

console.log('== Роль «Клиент МИЦ»');
const roles = await call('GET', '/hub/api/rest/roles?fields=id,name&$top=200');
let role = (roles.roles || []).find((r) => r.name === 'Клиент МИЦ');
// Создавать роли токену могут не разрешить (403). Тогда берём встроенную Reporter:
// читать задачи и комментарии, комментировать, прикладывать файлы, создавать
// задачи; менять поля и статусы нельзя. Это ближе всего к задуманному.
const FALLBACK_ROLE = 'Reporter';
if (!role) try {
  role = await call('POST', '/hub/api/rest/roles', {
    name: 'Клиент МИЦ',
    description: 'Клиент объекта в общем проекте «Сопровождение МИЦ»: читает свои задачи (по видимости), комментирует, прикладывает файлы. Без изменения полей и статусов.',
    permissions: ['JetBrains.YouTrack.READ_ISSUE', 'JetBrains.YouTrack.READ_COMMENT', 'JetBrains.YouTrack.CREATE_COMMENT',
      'JetBrains.YouTrack.UPDATE_COMMENT', 'JetBrains.YouTrack.DELETE_COMMENT', 'JetBrains.YouTrack.CREATE_ATTACHMENT_ISSUE',
      'JetBrains.YouTrack.VIEW_WATCHERS', 'JetBrains.YouTrack.READ_REPORT', 'jetbrains.jetpass.project-read-basic',
      'jetbrains.jetpass.user-read-basic', 'jetbrains.jetpass.profile-updateSelf'].map((key) => ({ key })),
  });
  console.log('  создана', role.id);
} catch (err) {
  if (!/403/.test(err.message)) throw err;
  role = (roles.roles || []).find((r) => r.name === FALLBACK_ROLE);
  if (!role) throw new Error(`Нет права создать роль, а встроенной ${FALLBACK_ROLE} не найдено`);
  console.log(`  создать роль нельзя (403) — использую встроенную «${FALLBACK_ROLE}» ${role.id}`);
} else console.log('  уже есть', role.id);

console.log('== Группы');
const groups = (await call('GET', '/hub/api/rest/usergroups?fields=id,name,projectRoles(id,role(id),project(id))&$top=300')).usergroups || [];
const byName = new Map(groups.map((g) => [g.name, g]));
for (const [, name] of Object.entries(CLINIC_GROUP)) {
  let g = byName.get(name);
  if (!g) {
    g = await call('POST', '/hub/api/rest/usergroups?fields=id,name,projectRoles(id,role(id),project(id))', { name, ...(PARENT ? { parent: { id: PARENT } } : {}), project: { id: MIC_HUB }, autoJoin: false });
    byName.set(name, g); console.log(`  + ${name}`);
  } else console.log(`  = ${name} (есть)`);
  const has = (g.projectRoles || []).some((pr) => pr.role?.id === role.id && pr.project?.id === MIC_HUB);
  if (!has) { await call('POST', `/hub/api/rest/usergroups/${g.id}/projectroles`, { role: { id: role.id }, project: { id: MIC_HUB } }); console.log(`      роль «${role.name}» в ${PROJECT} выдана`); }
  else console.log('      роль уже есть');
}

console.log(`== Видимость существующих задач ${PROJECT}`);
await new Promise((r) => setTimeout(r, 3000));
const ytGroups = await call('GET', '/api/groups?fields=id,name&$top=500');
const ytByName = new Map(ytGroups.map((g) => [g.name, g.id]));
const issues = await call('GET', '/api/issues?query=' + encodeURIComponent(`project: ${PROJECT}`) + '&fields=id,idReadable,visibility($type,permittedGroups(name)),customFields(name,value(name))&$top=100');
for (const i of issues) {
  const clinic = i.customFields.find((f) => f.name === 'Клиника')?.value?.name;
  const gname = CLINIC_GROUP[clinic]; const gid = ytByName.get(gname);
  if (!gid) { console.log(`  ${i.idReadable}: клиника «${clinic}» — группы нет, пропускаю`); continue; }
  const already = i.visibility?.$type === 'LimitedVisibility' && (i.visibility.permittedGroups || []).some((g) => g.name === gname);
  if (already) { console.log(`  ${i.idReadable}: уже ограничена (${gname})`); continue; }
  await call('POST', `/api/issues/${i.id}?fields=id`, { visibility: { $type: 'LimitedVisibility', permittedGroups: [{ id: gid }, { id: TEAM_YT }], permittedUsers: [] } });
  console.log(`  ${i.idReadable}: ${clinic} → ${gname} + команда проекта`);
}
