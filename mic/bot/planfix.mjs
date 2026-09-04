// Создание задач в Planfix через REST API.
//
// Зачем: канал MAX привязывает контакт к одной задаче и держит её месяцами —
// все заявки сыпались бы туда комментариями. Через API каждая заявка открывает
// СВОЮ задачу, независимо от статуса предыдущих.
//
// Структуру повторяем за задачей, которую создаёт сам канал (16585):
//   counterparty = контакт человека, assigner = он же, assignees = инженеры.
// Это важно не для красоты: по контакту Planfix понимает, кому адресовать
// ответ инженера, и отправляет его в MAX.
import { CLINIC_ENGINEER } from '../ticket.mjs';

const TOKEN = process.env.PLANFIX_API_TOKEN;
const ACCOUNT = process.env.PLANFIX_ACCOUNT || 'sensey';
const BASE = process.env.PLANFIX_API_BASE || `https://${ACCOUNT}.planfix.ru/rest`;
const TEMPLATE_ID = Number(process.env.PLANFIX_TEMPLATE_ID || 1);
// Проект, в который складываются заявки из MAX. Пусто — задача ляжет без проекта.
const PROJECT_ID = Number(process.env.PLANFIX_PROJECT_ID || 0);
// Шаблон контакта — такой же, как у контактов, заведённых каналом MAX
const CONTACT_TEMPLATE_ID = Number(process.env.PLANFIX_CONTACT_TEMPLATE_ID || 1);

// Кого ставить, если клиника незнакомая: вся группа, как делал канал.
const ASSIGNEES = (process.env.PLANFIX_ASSIGNEES || 'user:63,user:1,user:43,user:7')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Переопределение закреплённых инженеров без правки кода:
// PLANFIX_CLINIC_ASSIGNEES="МедГород=user:1,ГП-1=user:63"
const OVERRIDES = Object.fromEntries(
  (process.env.PLANFIX_CLINIC_ASSIGNEES || '')
    .split(',').map((pair) => pair.split('=').map((x) => x.trim()))
    .filter(([clinic, user]) => clinic && user),
);

/** Инженер, закреплённый за клиникой. Незнакомая клиника — вся группа. */
export function assigneesFor(clinic) {
  const one = OVERRIDES[clinic] || CLINIC_ENGINEER[clinic];
  return one ? [one] : ASSIGNEES;
}

export const planfixConfigured = Boolean(TOKEN);

async function pf(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!res.ok) {
    const err = new Error(`Planfix ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * Ищет контакт человека по имени из MAX.
 * Канал MAX заводит контакт вида {name:'Дмитрий', lastname:'Серов'},
 * а MAX отдаёт нам одну строку «Дмитрий Серов» — поэтому сверяем по частям.
 */
export async function findContact(fullName) {
  const target = norm(fullName);
  if (!target) return null;
  const parts = target.split(' ').filter(Boolean);

  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await pf('POST', '/contact/list', {
      offset, pageSize: 100, fields: 'id,name,lastname,isCompany',
    });
    const list = page?.contacts || [];
    for (const c of list) {
      if (c.isCompany) continue;
      const combos = [
        norm(`${c.name} ${c.lastname}`),
        norm(`${c.lastname} ${c.name}`),
        norm(c.name),
      ];
      if (combos.includes(target)) return c;
      // «Дмитрий Серов» ↔ name=Дмитрий, lastname=Серов, порядок неважен
      if (parts.length >= 2 && norm(c.name) && norm(c.lastname)
        && parts.includes(norm(c.name)) && parts.includes(norm(c.lastname))) return c;
    }
    if (list.length < 100) break;
  }
  return null;
}

/**
 * Создаёт отдельную задачу под заявку.
 * @param {object} p
 * @param {string} p.name         заголовок задачи
 * @param {string} p.description  карточка заявки
 * @param {number|null} p.contactId  контакт автора (без него задача будет ничья)
 * @returns {Promise<number>} id созданной задачи
 */
/**
 * Заводит контакт человека, если канал его ещё не создал.
 * Без контакта задача остаётся ничьей, а ответить человеку некуда.
 */
export async function createContact(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [name, ...rest] = parts;
  const res = await pf('POST', '/contact/', {
    template: { id: CONTACT_TEMPLATE_ID },
    name,
    lastname: rest.join(' '),
    description: 'Заведён ботом заявок из MAX.',
  });
  const id = res?.id ?? null;
  return id ? { id, name, lastname: rest.join(' ') } : null;
}

/** Загружает файл в Planfix. Возвращает id, который цепляется к задаче. */
export async function uploadFile(buffer, filename) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer]), filename || 'файл');
  const res = await fetch(BASE + '/file/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Planfix upload: ${res.status} ${text.slice(0, 150)}`);
  return JSON.parse(text).id;
}

/**
 * Комментарии задачи новее указанного id.
 * Возвращает только те, что написал сотрудник: карточка заявки и реплики
 * самого клиента нам не нужны — их человек и так видел.
 */
export async function newComments(taskId, sinceId = 0) {
  const res = await pf('POST', `/task/${taskId}/comments/list`, {
    offset: 0, pageSize: 50,
    fields: 'id,dateTime,type,owner,description,recipients,isDeleted',
  });
  const all = res?.comments || [];
  return all
    .filter((c) => !c.isDeleted && Number(c.id) > Number(sinceId))
    .filter((c) => String(c.owner?.id || '').startsWith('user:'))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** Адресован ли комментарий клиенту — по нему решаем, пересылать ли в MAX. */
export function addressedToContact(comment, contactId) {
  if (!contactId) return false;
  const users = comment?.recipients?.users || [];
  if (!users.length) return true;            // без адресатов — считаем общим
  return users.some((u) => String(u.id) === `contact:${contactId}`);
}

export async function createTask({ name, description, contactId, fileIds = [], clinic = null }) {
  if (!TOKEN) throw new Error('PLANFIX_API_TOKEN не задан');

  const body = {
    name: String(name).slice(0, 250),
    description,
    template: { id: TEMPLATE_ID },
    assignees: { users: assigneesFor(clinic).map((id) => ({ id })) },
  };
  if (PROJECT_ID) body.project = { id: PROJECT_ID };
  if (fileIds.length) body.files = fileIds.map((id) => ({ id }));
  if (contactId) {
    const ref = { id: `contact:${contactId}` };
    body.counterparty = ref;   // клиент, по нему Planfix адресует ответ
    body.assigner = ref;       // автор заявки — тот же человек
  }

  const res = await pf('POST', '/task/', body);
  return res?.id ?? null;
}

/** Заголовок задачи: номер, приоритет и суть — чтобы список читался с одного взгляда. */
export function taskName({ ticketNo, priority, fields }) {
  const short = String(fields.title || '').replace(/\s+/g, ' ').slice(0, 90);
  const kind = fields.kind === 'Доработка' ? 'Доработка · ' : '';
  return `[${ticketNo}] ${kind}${priority} · ${fields.clinic} / ${fields.module} — ${short}`;
}
