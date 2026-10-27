// Дубль заявки в YouTrack — второй трекер рядом с Planfix.
//
// Задача в проекте MIC с теми же полями, исполнитель — тот же инженер по
// клинике (поле «Разработчик»), файлы во вложениях. Видимость задачи
// ограничена группой клиники и командой проекта: админ клиники видит в MIC
// только своё. Номер задачи YouTrack становится номером заявки для человека. Обратно: комментарии
// инженеров и их файлы уходят человеку в MAX, ответы человека — в задачу.
//
// Всё, что здесь есть, проверено живьём на yt.medinfocenter.ru: создание с
// полями, назначение, комментарии, вложения туда и обратно, запрос
// «что изменилось с …». Суточной квоты, как у Planfix, у YouTrack нет.
import { CLINIC_ENGINEER, CLINIC_GROUP, CLINIC_OBJECT, ENGINEER_LOGINS, KINDS, URGENCIES } from '../ticket.mjs';

const BASE = (process.env.YOUTRACK_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.YOUTRACK_TOKEN;
const PROJECT = process.env.YOUTRACK_PROJECT || 'MIC';

export const youtrackConfigured = Boolean(BASE && TOKEN);

// Метка наших комментариев. Токен принадлежит инженеру (Роману), поэтому
// «свой/чужой» по автору не отличить — только по метке в тексте.
export const FROM_MAX_MARK = '💬 Из MAX';
export const isOwnComment = (c) => String(c?.text || '').trim().startsWith(FROM_MAX_MARK);

const MIN_GAP_MS = Number(process.env.YOUTRACK_MIN_GAP_MS || 150);
let lastCallAt = 0;
let gate = Promise.resolve();
async function throttle() {
  const my = gate.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  gate = my.catch(() => {});
  return my;
}

async function yt(method, path, { body, form, timeout = 30_000 } = {}) {
  await throttle();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form ? form : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!res.ok) {
    const err = new Error(`YouTrack ${method} ${path}: ${res.status} ${(json?.error_description || text).slice(0, 200)}`);
    err.status = res.status;
    err.detail = json?.error_description || text;
    throw err;
  }
  return json;
}

/* ---------- проект ---------- */

let projectId = null;
let teamGroupId = null;          // команда проекта — ей видны все задачи
const groupIds = new Map();      // имя группы → id (для видимости по клинике)
let monthBundleId = null;        // список значений «Месяц создания»
const knownMonths = new Set();

export async function loadProject() {
  if (!youtrackConfigured) return null;
  const list = await yt('GET', `/admin/projects?fields=id,shortName,name,team(id,name)&query=${encodeURIComponent(PROJECT)}`);
  const p = (list || []).find((x) => x.shortName === PROJECT) || (list || [])[0];
  if (!p) throw new Error(`YouTrack: проект «${PROJECT}» не найден`);
  projectId = p.id;
  teamGroupId = p.team?.id || null;
  console.log(`YouTrack: проект ${p.shortName} «${p.name}» (${p.id})`);
  await loadGroups(p).catch((e) => console.error(`YouTrack: группы не прочитались (${e.message}) — задачи будут без ограничения видимости.`));
  await loadMonths().catch((e) => console.error(`YouTrack: список «Месяц создания» не прочитался (${e.message}).`));
  return p;
}

/** Группы клиник и команда проекта — для ограничения видимости задач. */
async function loadGroups(project) {
  const list = await yt('GET', '/groups?fields=id,name&$top=500');
  groupIds.clear();
  for (const g of list || []) groupIds.set(g.name, g.id);
  if (!teamGroupId) teamGroupId = groupIds.get(`${project.name} Team`) || null;
  const missing = Object.values(CLINIC_GROUP).filter((n) => !groupIds.has(n));
  console.log(`YouTrack: групп клиник ${Object.keys(CLINIC_GROUP).length - missing.length}/${Object.keys(CLINIC_GROUP).length}` +
    `${missing.length ? `, нет: ${missing.join(', ')}` : ''}; команда ${teamGroupId ? 'найдена' : 'НЕ найдена'}`);
}

async function loadMonths() {
  const fields = await yt('GET', `/admin/projects/${projectId}/customFields?fields=field(name),bundle(id)&$top=100`);
  const f = (fields || []).find((x) => x.field?.name === 'Месяц создания');
  if (!f?.bundle?.id) return;
  monthBundleId = f.bundle.id;
  const vals = await yt('GET', `/admin/customFieldSettings/bundles/version/${monthBundleId}/values?fields=name&$top=500`);
  knownMonths.clear();
  for (const v of vals || []) knownMonths.add(v.name);
}

/** «2026.10» — месяц оформления заявки, как заведено в YouTrack. */
export function monthOf(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Добавляет месяц в список «Месяц создания», если его там ещё нет. */
export async function ensureMonth(name) {
  if (knownMonths.has(name)) return true;
  if (!monthBundleId) return false;
  try {
    await yt('POST', `/admin/customFieldSettings/bundles/version/${monthBundleId}/values?fields=id,name`, { body: { name, $type: 'VersionBundleElement' } });
    knownMonths.add(name);
    console.log(`YouTrack: в «Месяц создания» добавлен ${name}`);
    return true;
  } catch (err) {
    if (/already exists|уже существует/i.test(String(err.detail || ''))) { knownMonths.add(name); return true; }
    console.error(`YouTrack: не удалось добавить месяц ${name}: ${err.message}`);
    return false;
  }
}

/** Видимость задачи: группа клиники + команда проекта. null — ограничить нечем. */
export function visibilityFor(clinic) {
  const groups = [];
  const g = groupIds.get(CLINIC_GROUP[clinic]);
  if (g) groups.push({ id: g });
  if (teamGroupId) groups.push({ id: teamGroupId });
  if (!g) return null;   // без группы клиники ограничивать нельзя: команда и так всё видит, а клиент не увидит ничего
  return { $type: 'LimitedVisibility', permittedGroups: groups, permittedUsers: [] };
}

/* ---------- поля ---------- */

// Доработка в YouTrack — «Задание» (в API значение называется Task).
const TYPE_BY_KIND = { [KINDS[0]]: 'Bug', [KINDS[1]]: 'Task' };
const PRIORITY_BY_URGENCY = { [URGENCIES[0]]: 'Critical', [URGENCIES[1]]: 'Major', [URGENCIES[2]]: 'Minor' };

const ENUM = (name, value) => ({ name, $type: 'SingleEnumIssueCustomField', value: { name: value } });
const MULTI = (name, value) => ({ name, $type: 'MultiEnumIssueCustomField', value: [{ name: value }] });
const VERSION = (name, value) => ({ name, $type: 'SingleVersionIssueCustomField', value: { name: value } });
const TEXT = (name, value) => ({ name, $type: 'SimpleIssueCustomField', value: String(value).slice(0, 1000) });

/** Исполнитель по клинике: тот же инженер, что и в Planfix, но по логину. */
export function assigneeFor(clinic) {
  const pf = CLINIC_ENGINEER[clinic];
  return pf ? ENGINEER_LOGINS[pf] || null : null;
}

function customFields(f, month) {
  const out = [];
  const isBug = !f.kind || f.kind === KINDS[0];
  if (f.clinic) out.push(ENUM('Клиника', f.clinic));
  const obj = CLINIC_OBJECT[f.clinic];
  if (obj) { out.push(MULTI('Объект', obj)); if (isBug) out.push(MULTI('Где выявлено', obj)); }
  if (f.kind) { out.push(ENUM('Тип заявки', f.kind)); if (TYPE_BY_KIND[f.kind]) out.push(ENUM('Type', TYPE_BY_KIND[f.kind])); }
  if (f.urgency) { out.push(ENUM('Срочность', f.urgency)); if (PRIORITY_BY_URGENCY[f.urgency]) out.push(ENUM('Priority', PRIORITY_BY_URGENCY[f.urgency])); }
  if (month) out.push(VERSION('Месяц создания', month));
  if (f.module) out.push(TEXT('Модуль', f.module));
  if (f.role) out.push(TEXT('Роль', f.role));
  if (f.patient) out.push(TEXT('Пациент', f.patient));
  if (f.contact) out.push(TEXT('Контакт заявителя', f.contact));
  out.push(TEXT('Источник', 'бот MAX'));
  const login = assigneeFor(f.clinic);
  if (login) out.push({ name: 'Разработчик', $type: 'SingleUserIssueCustomField', value: { login } });
  return out;
}

/* ---------- задачи ---------- */

/**
 * Создаёт задачу. Если YouTrack отверг какое-то поле (нет в проекте, не тот тип,
 * инженера нет в команде) — выбрасывает только его и пробует снова: заявка важнее полей.
 * @returns {{id:string, key:string}}  внутренний id и читаемый номер (MIC-12)
 */
export async function createIssue({ summary, description, fields, createdAt = Date.now() }) {
  if (!projectId) await loadProject();
  const month = monthOf(createdAt);
  const monthOk = await ensureMonth(month);
  const body = {
    project: { id: projectId },
    summary: String(summary).slice(0, 250),
    description,
    customFields: customFields(fields || {}, monthOk ? month : null),
  };
  const visibility = visibilityFor(fields?.clinic);
  if (visibility) body.visibility = visibility;
  else if (fields?.clinic) console.error(`YouTrack: для «${fields.clinic}» нет группы клиентов — задача без ограничения видимости.`);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const res = await yt('POST', '/issues?fields=id,idReadable', { body });
      return { id: res.id, key: res.idReadable };
    } catch (err) {
      const detail = String(err.detail || '');
      if (body.visibility && /visibility|видимост|permittedGroups|group/i.test(detail) && (err.status === 400 || err.status === 403)) {
        console.error(`YouTrack отверг ограничение видимости (${detail.slice(0, 80)}) — создаю без него.`);
        delete body.visibility;
        continue;
      }
      // «Сущность типа <значение> с указанным именем не найдена» — значения нет в списке поля
      const noValue = /Сущность типа (.+?) с указанным именем/.exec(detail);
      const m = /custom-field-name-(.+?)$/.exec(detail) ||
                (noValue || /Недопустимое значение/.test(detail)) && [null, null];
      if (!m || !body.customFields?.length || (err.status !== 400 && err.status !== 500)) throw err;
      const bad = m[1];
      const hasValue = (f, name) => Array.isArray(f.value) ? f.value.some((v) => v?.name === name) : f.value?.name === name;
      const badValue = noValue && body.customFields.find((f) => hasValue(f, noValue[1]));
      if (bad) {
        console.error(`YouTrack отверг поле «${bad}» — создаю без него.`);
        body.customFields = body.customFields.filter((f) => f.name !== bad);
      } else if (badValue) {
        console.error(`YouTrack: в поле «${badValue.name}» нет значения «${noValue[1]}» — создаю без этого поля.`);
        body.customFields = body.customFields.filter((f) => f !== badValue);
      } else {
        // «Недопустимое значение» без имени — чаще всего исполнитель вне команды
        const dev = body.customFields.find((f) => f.name === 'Разработчик');
        if (dev) { console.error(`YouTrack не принял исполнителя ${dev.value?.login} — создаю без него.`); body.customFields = body.customFields.filter((f) => f !== dev); }
        else { console.error('YouTrack отверг поля — создаю без всех.'); body.customFields = []; }
      }
      if (!body.customFields.length) delete body.customFields;
    }
  }
  throw new Error('YouTrack: задача не создалась после нескольких попыток');
}

/** Файл во вложения задачи. */
export async function uploadAttachment(issueId, buffer, filename) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer]), filename || 'файл');
  const res = await yt('POST', `/issues/${issueId}/attachments?fields=id,name`, { form: fd, timeout: 120_000 });
  return Array.isArray(res) ? res[0]?.id : res?.id;
}

/** Комментарий от имени человека из MAX (автором будет владелец токена — отсюда метка). */
export async function addComment(issueId, text) {
  const res = await yt('POST', `/issues/${issueId}/comments?fields=id`, { body: { text } });
  return res?.id ?? true;
}

/** Комментарии задачи, созданные после момента `sinceMs`, кроме удалённых и наших. */
export async function newComments(issueId, sinceMs = 0) {
  const list = await yt('GET',
    `/issues/${issueId}/comments?fields=id,text,created,deleted,author(login,fullName),attachments(id,name,url,size)&$top=100`);
  return (list || [])
    .filter((c) => !c.deleted && Number(c.created) > Number(sinceMs))
    .filter((c) => !isOwnComment(c))
    .sort((a, b) => a.created - b.created);
}

/** Скачивает вложение по ссылке из комментария (она относительная). */
export async function downloadAttachment(url) {
  await throttle();
  const abs = /^https?:/.test(url) ? url : `${BASE}${url}`;
  const res = await fetch(abs, { headers: { Authorization: `Bearer ${TOKEN}` }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`YouTrack download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const pad = (n) => String(n).padStart(2, '0');
export function ytDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Задачи проекта, менявшиеся после `sinceMs`. Один запрос на все задачи разом. */
export async function changedIssuesSince(sinceMs) {
  const q = `project: ${PROJECT} updated: ${ytDateTime(sinceMs)} .. *`;
  const list = await yt('GET', `/issues?query=${encodeURIComponent(q)}&fields=id&$top=500`);
  return new Set((list || []).map((i) => i.id));
}

/** Ссылка на задачу для человека и логов. */
export const issueUrl = (key) => `${BASE}/issue/${key}`;
