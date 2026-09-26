// Дубль заявки в YouTrack — второй трекер рядом с Planfix.
//
// Задача в проекте MIC с теми же полями, исполнитель — тот же инженер по
// клинике (поле «Разработчик»), файлы во вложениях. Обратно: комментарии
// инженеров и их файлы уходят человеку в MAX, ответы человека — в задачу.
//
// Всё, что здесь есть, проверено живьём на yt.medinfocenter.ru: создание с
// полями, назначение, комментарии, вложения туда и обратно, запрос
// «что изменилось с …». Суточной квоты, как у Planfix, у YouTrack нет.
import { CLINIC_ENGINEER, ENGINEER_LOGINS, KINDS, URGENCIES } from '../ticket.mjs';

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
export async function loadProject() {
  if (!youtrackConfigured) return null;
  const list = await yt('GET', `/admin/projects?fields=id,shortName,name&query=${encodeURIComponent(PROJECT)}`);
  const p = (list || []).find((x) => x.shortName === PROJECT) || (list || [])[0];
  if (!p) throw new Error(`YouTrack: проект «${PROJECT}» не найден`);
  projectId = p.id;
  console.log(`YouTrack: проект ${p.shortName} «${p.name}» (${p.id})`);
  return p;
}

/* ---------- поля ---------- */

const TYPE_BY_KIND = { [KINDS[0]]: 'Bug', [KINDS[1]]: 'Feature' };
const PRIORITY_BY_URGENCY = { [URGENCIES[0]]: 'Critical', [URGENCIES[1]]: 'Major', [URGENCIES[2]]: 'Minor' };

const ENUM = (name, value) => ({ name, $type: 'SingleEnumIssueCustomField', value: { name: value } });
const TEXT = (name, value) => ({ name, $type: 'SimpleIssueCustomField', value: String(value).slice(0, 1000) });

/** Исполнитель по клинике: тот же инженер, что и в Planfix, но по логину. */
export function assigneeFor(clinic) {
  const pf = CLINIC_ENGINEER[clinic];
  return pf ? ENGINEER_LOGINS[pf] || null : null;
}

function customFields(f, ticketNo) {
  const out = [];
  if (f.clinic) out.push(ENUM('Клиника', f.clinic));
  if (f.kind) { out.push(ENUM('Тип заявки', f.kind)); if (TYPE_BY_KIND[f.kind]) out.push(ENUM('Type', TYPE_BY_KIND[f.kind])); }
  if (f.urgency) { out.push(ENUM('Срочность', f.urgency)); if (PRIORITY_BY_URGENCY[f.urgency]) out.push(ENUM('Priority', PRIORITY_BY_URGENCY[f.urgency])); }
  if (ticketNo) out.push(TEXT('Номер заявки', ticketNo));
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
export async function createIssue({ summary, description, fields, ticketNo }) {
  if (!projectId) await loadProject();
  const body = {
    project: { id: projectId },
    summary: String(summary).slice(0, 250),
    description,
    customFields: customFields(fields || {}, ticketNo),
  };
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const res = await yt('POST', '/issues?fields=id,idReadable', { body });
      return { id: res.id, key: res.idReadable };
    } catch (err) {
      const detail = String(err.detail || '');
      // «Сущность типа <значение> с указанным именем не найдена» — значения нет в списке поля
      const noValue = /Сущность типа (.+?) с указанным именем/.exec(detail);
      const m = /custom-field-name-(.+?)$/.exec(detail) ||
                (noValue || /Недопустимое значение/.test(detail)) && [null, null];
      if (!m || !body.customFields?.length || (err.status !== 400 && err.status !== 500)) throw err;
      const bad = m[1];
      const badValue = noValue && body.customFields.find((f) => f.value?.name === noValue[1]);
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
