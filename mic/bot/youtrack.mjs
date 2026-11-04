// Дубль заявки в YouTrack — второй трекер рядом с Planfix.
//
// Задача в проекте клиники (или MIC в режиме single), исполнитель — тот же инженер по
// клинике (поле «Разработчик»), файлы во вложениях. Видимость задачи
// ограничена группой клиники и командой проекта: админ клиники видит в MIC
// только своё. Номер задачи YouTrack становится номером заявки для человека. Обратно: комментарии
// инженеров и их файлы уходят человеку в MAX, ответы человека — в задачу.
//
// Всё, что здесь есть, проверено живьём на yt.medinfocenter.ru: создание с
// полями, назначение, комментарии, вложения туда и обратно, запрос
// «что изменилось с …». Суточной квоты, как у Planfix, у YouTrack нет.
import { CLINIC_ENGINEER, CLINIC_PROJECT, CLINIC_GROUP, CLINIC_OBJECT, ENGINEER_LOGINS, KINDS, URGENCIES } from '../ticket.mjs';

const BASE = (process.env.YOUTRACK_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.YOUTRACK_TOKEN;
const PROJECT = process.env.YOUTRACK_PROJECT || 'MIC';
const TIMEZONE = process.env.YOUTRACK_TIMEZONE || 'Asia/Yekaterinburg';
export const clinicRouting = process.env.YOUTRACK_ROUTING === 'clinics';
export const projectFor = clinic => {
  if (!clinicRouting) return PROJECT;
  const key = CLINIC_PROJECT[clinic];
  if (!key) throw new Error(`YouTrack: для клиники «${clinic}» проект не настроен`);
  return key;
};

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

const contexts = new Map();
const bundles = new Map();
const monthWrites = new Map();
const groupIds = new Map();

async function bundleValues(kind, id) {
  const key = `${kind}:${id}`;
  if (!bundles.has(key)) {
    const promise = yt('GET', `/admin/customFieldSettings/bundles/${kind}/${id}/values?fields=name,archived&$top=1000`);
    bundles.set(key, promise);
    promise.catch(() => bundles.delete(key));
  }
  return bundles.get(key);
}

export async function loadProject() {
  if (!youtrackConfigured) return null;
  const wanted = clinicRouting ? [...new Set(Object.values(CLINIC_PROJECT))] : [PROJECT];
  const list = await yt('GET', `/admin/projects?fields=id,shortName,name,archived,team(id,name)&$top=500${clinicRouting ? '' : `&query=${encodeURIComponent(PROJECT)}`}`);
  const missing = wanted.filter(key => !list.some(p => p.shortName === key && !p.archived));
  if (missing.length) throw new Error(`YouTrack: недоступны проекты ${missing.join(', ')}`);
  // Сначала валидируем весь список — при ошибке не переключаемся на случайный проект.
  if (!clinicRouting) {
    const groups = await yt('GET', '/groups?fields=id,name&$top=500').catch(() => []);
    for (const g of groups || []) groupIds.set(g.name, g.id);
  }
  const loaded = new Map();
  for (const key of wanted) {
    const p = list.find(p => p.shortName === key);
    const ctx = { ...p, fields: new Set(), enumValues: new Map(), knownMonths: new Set(), monthBundleId: null,
      teamGroupId: p.team?.id || groupIds.get(`${p.name} Team`) || null };
    const fields = await yt('GET', `/admin/projects/${p.id}/customFields?fields=$type,field(name),bundle(id)&$top=100`);
    for (const f of fields || []) {
      const name = f.field?.name, id = f.bundle?.id;
      if (!name) continue;
      ctx.fields.add(name);
      if (name === 'Месяц создания' && f.$type === 'VersionProjectCustomField' && id) {
        ctx.monthBundleId = id;
        for (const v of await bundleValues('version', id)) ctx.knownMonths.add(v.name);
      } else if (f.$type === 'EnumProjectCustomField' && id) {
        ctx.enumValues.set(name, new Set((await bundleValues('enum', id)).filter(v => !v.archived).map(v => v.name)));
      }
    }
    if (clinicRouting && !ctx.fields.has('Разработчик')) throw new Error(`YouTrack: в ${key} нет поля «Разработчик»`);
    loaded.set(key, ctx);
  }
  contexts.clear();
  for (const [key, ctx] of loaded) contexts.set(key, ctx);
  console.log(`YouTrack: ${clinicRouting ? 'проекты клиник' : 'проект'} ${wanted.join(', ')}`);
  if (!clinicRouting) {
    const ctx = contexts.get(PROJECT);
    console.log(`YouTrack: групп клиник ${Object.values(CLINIC_GROUP).filter(n => groupIds.has(n)).length}/${Object.keys(CLINIC_GROUP).length}; команда ${ctx.teamGroupId ? 'найдена' : 'НЕ найдена'}`);
    console.log(`YouTrack: списков значений ${ctx.enumValues.size}; месяцев ${ctx.knownMonths.size}`);
  }
  return contexts.get(wanted[0]);
}

async function contextFor(clinic) {
  const key = projectFor(clinic);
  if (!contexts.has(key)) await loadProject();
  const ctx = contexts.get(key);
  if (!ctx) throw new Error(`YouTrack: проект ${key} недоступен`);
  return ctx;
}
const valueKnown = (ctx, field, value) => !ctx.enumValues.has(field) || ctx.enumValues.get(field).has(value);

export function monthOf(ms = Date.now()) {
  const p = dateParts(ms);
  return `${p.year}.${p.month}`;
}
export async function ensureMonth(name, ctx = contexts.get(PROJECT)) {
  if (!ctx) return false;
  if (ctx.knownMonths.has(name)) return true;
  if (!ctx.monthBundleId) return false;
  const key = `${ctx.monthBundleId}:${name}`;
  if (!monthWrites.has(key)) monthWrites.set(key, (async () => {
    try {
      await yt('POST', `/admin/customFieldSettings/bundles/version/${ctx.monthBundleId}/values?fields=id,name`, { body: { name, $type: 'VersionBundleElement' } });
    } catch (err) {
      if (!/already exists|уже существует/i.test(String(err.detail || ''))) throw err;
    }
    for (const c of contexts.values()) if (c.monthBundleId === ctx.monthBundleId) c.knownMonths.add(name);
    bundles.delete(`version:${ctx.monthBundleId}`);
    return true;
  })());
  try { return await monthWrites.get(key); }
  catch (err) {
    monthWrites.delete(key);
    console.error(`YouTrack: не удалось добавить месяц ${name}: ${err.message}`);
    if (clinicRouting) throw err;
    return false;
  }
}

// В отдельных проектах изоляцию задают права проекта. Ограничение группами MIC не переносим в новые задачи.
export function visibilityFor(clinic) {
  if (clinicRouting) return null;
  const ctx = contexts.get(PROJECT), g = groupIds.get(CLINIC_GROUP[clinic]);
  if (!g) return null;
  return { $type: 'LimitedVisibility', permittedGroups: [{ id: g }, ...(ctx?.teamGroupId ? [{ id: ctx.teamGroupId }] : [])], permittedUsers: [] };
}

export async function issueInfo(id) {
  const i = await yt('GET', `/issues/${encodeURIComponent(id)}?fields=id,idReadable,project(id,shortName),visibility($type,permittedGroups(id,name),permittedUsers(id)),customFields(name,value(name))`);
  return { id: i.id, key: i.idReadable, project: i.project?.shortName, visibility: i.visibility,
    clinic: i.customFields?.find(f => f.name === 'Клиника')?.value?.name || Object.keys(CLINIC_PROJECT).find(c => CLINIC_PROJECT[c] === i.project?.shortName) || null };
}
export async function moveIssue(id, clinic) {
  const ctx = await contextFor(clinic);
  await yt('POST', `/issues/${encodeURIComponent(id)}?fields=id`, { body: { project: { id: ctx.id } } });
  return issueInfo(id);
}

/** Убирает только старую машинную видимость MIC после переноса в проект клиники. */
export async function clearLegacyVisibility(info, clinic) {
  const v=info.visibility, names=(v?.permittedGroups || []).map(g => g.name);
  if (!clinicRouting || info.project !== projectFor(clinic) || v?.$type !== 'LimitedVisibility' || v.permittedUsers?.length) return false;
  if (!names.includes('Сопровождение МИЦ Team') || names.some(n => !['Сопровождение МИЦ Team',CLINIC_GROUP[clinic]].includes(n))) return false;
  await yt('POST', `/issues/${info.id}?fields=id`, {body:{visibility:{$type:'UnlimitedVisibility'}}});
  return true;
}

/* ---------- поля ---------- */

// Доработка в YouTrack — «Задание» (в API значение называется Task).
const TYPE_BY_KIND = { [KINDS[0]]: 'Bug', [KINDS[1]]: 'Task' };
const PRIORITY_BY_URGENCY = { [URGENCIES[0]]: 'Critical', [URGENCIES[1]]: 'Major', [URGENCIES[2]]: 'Minor' };

const ENUM = (name, value) => ({ name, $type: 'SingleEnumIssueCustomField', value: { name: value } });
const MULTI = (name, value) => ({ name, $type: 'MultiEnumIssueCustomField', value: [{ name: value }] });
// Списочное поле только с известным значением; иначе предупреждение и без поля.
const pushEnum = (ctx, out, make, name, value) => {
  if (!value) return;
  if (valueKnown(ctx, name, value)) out.push(make(name, value));
  else console.error(`YouTrack: в поле «${name}» нет значения «${value}» — поле не заполняю.`);
};
const VERSION = (name, value) => ({ name, $type: 'SingleVersionIssueCustomField', value: { name: value } });
const TEXT = (name, value) => ({ name, $type: 'SimpleIssueCustomField', value: String(value).slice(0, 1000) });

/** Исполнитель по клинике: тот же инженер, что и в Planfix, но по логину. */
export function assigneeFor(clinic) {
  const pf = CLINIC_ENGINEER[clinic];
  return pf ? ENGINEER_LOGINS[pf] || null : null;
}

function customFields(f, month, ctx) {
  const out = [];
  const isBug = !f.kind || f.kind === KINDS[0];
  pushEnum(ctx, out, ENUM, 'Клиника', f.clinic);
  const obj = CLINIC_OBJECT[f.clinic];
  pushEnum(ctx, out, MULTI, 'Объект', obj);
  if (isBug) pushEnum(ctx, out, MULTI, 'Где выявлено', obj);
  else if (clinicRouting) out.push({name:'Где выявлено',$type:'MultiEnumIssueCustomField',value:[]});
  pushEnum(ctx, out, ENUM, 'Тип заявки', f.kind);
  pushEnum(ctx, out, ENUM, 'Type', TYPE_BY_KIND[f.kind]);
  pushEnum(ctx, out, ENUM, 'Срочность', f.urgency);
  pushEnum(ctx, out, ENUM, 'Priority', PRIORITY_BY_URGENCY[f.urgency]);
  if (month) out.push(VERSION('Месяц создания', month));
  if (f.module) out.push(TEXT('Модуль', f.module));
  if (f.role) out.push(TEXT('Роль', f.role));
  if (f.patient) out.push(TEXT('Пациент', f.patient));
  if (f.contact) out.push(TEXT('Контакт заявителя', f.contact));
  out.push(TEXT('Источник', 'бот MAX'));
  const login = assigneeFor(f.clinic);
  if (login) out.push({ name: 'Разработчик', $type: 'SingleUserIssueCustomField', value: { login } });
  return clinicRouting ? out.filter(f => ctx.fields.has(f.name)) : out;
}

/* ---------- задачи ---------- */

/**
 * Создаёт задачу. Если YouTrack отверг какое-то поле (нет в проекте, не тот тип,
 * инженера нет в команде) — выбрасывает только его и пробует снова: заявка важнее полей.
 * @returns {{id:string, key:string}}  внутренний id и читаемый номер (MIC-12)
 */
export async function createIssue({ summary, description, fields, createdAt = Date.now() }) {
  const ctx = await contextFor(fields?.clinic);
  const month = monthOf(createdAt);
  const monthOk = await ensureMonth(month, ctx);
  const body = {
    project: { id: ctx.id },
    summary: String(summary).slice(0, 250),
    description,
    customFields: customFields(fields || {}, monthOk ? month : null, ctx),
  };
  const visibility = visibilityFor(fields?.clinic);
  if (visibility) body.visibility = visibility;
  else if (!clinicRouting && fields?.clinic) console.error(`YouTrack: для «${fields.clinic}» нет группы клиентов — задача без ограничения видимости.`);
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
      if (clinicRouting && (bad === 'Разработчик' || (!bad && !badValue))) throw err;
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

// Статус «взято в работу». В MIC это «In Progress»; если в проекте он зовётся иначе — задать в окружении.
const STATE_IN_PROGRESS = process.env.YOUTRACK_STATE_IN_PROGRESS || 'In Progress';

/**
 * Инженер нажал «В работу»: исполнитель — он, статус — «В работе».
 * Если статус в проекте не принимается, меняем хотя бы исполнителя.
 */
export async function takeIssue(issueId, login) {
  const assignee = { name: 'Разработчик', $type: 'SingleUserIssueCustomField', value: { login } };
  const state = { name: 'State', $type: 'StateIssueCustomField', value: { name: STATE_IN_PROGRESS } };
  try {
    await yt('POST', `/issues/${issueId}?fields=id`, { body: { customFields: [state, assignee] } });
    return { state: STATE_IN_PROGRESS };
  } catch (err) {
    if (err.status !== 400 && err.status !== 500) throw err;
    console.error(`YouTrack не принял статус «${STATE_IN_PROGRESS}» (${String(err.detail || '').slice(0, 80)}) — меняю только исполнителя.`);
    await yt('POST', `/issues/${issueId}?fields=id`, { body: { customFields: [assignee] } });
    return { state: null };
  }
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

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const dateParts = ms => Object.fromEntries(dateFormatter.formatToParts(new Date(ms)).map(p => [p.type,p.value]));
export function ytDateTime(ms) {
  const p = dateParts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Задачи проекта, менявшиеся после `sinceMs`. Один запрос на все задачи разом. */
export async function changedIssuesSince(sinceMs) {
  const projects = clinicRouting ? [...new Set(Object.values(CLINIC_PROJECT))] : [PROJECT];
  const scope = `project: ${projects.join(', ')}`;
  const q = `${scope} updated: ${ytDateTime(sinceMs)} .. *`;
  const result = new Set();
  result.details = new Map();
  for (let offset = 0; ; offset += 500) {
    const list = await yt('GET', `/issues?query=${encodeURIComponent(q)}&fields=id,idReadable,project(shortName)&$top=500&$skip=${offset}`);
    for (const i of list || []) { result.add(i.id); result.details.set(i.id, i); }
    if (!list || list.length < 500) break;
  }
  return result;
}

/** Ссылка на задачу для человека и логов. */
export const issueUrl = (key) => `${BASE}/issue/${key}`;
