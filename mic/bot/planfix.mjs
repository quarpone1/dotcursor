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
const TOKEN = process.env.PLANFIX_API_TOKEN;
const ACCOUNT = process.env.PLANFIX_ACCOUNT || 'sensey';
const BASE = process.env.PLANFIX_API_BASE || `https://${ACCOUNT}.planfix.ru/rest`;
const TEMPLATE_ID = Number(process.env.PLANFIX_TEMPLATE_ID || 1);
// Проект, в который складываются заявки из MAX. Пусто — задача ляжет без проекта.
const PROJECT_ID = Number(process.env.PLANFIX_PROJECT_ID || 0);

// Кого назначать исполнителями. По умолчанию — те же, кого ставит канал.
const ASSIGNEES = (process.env.PLANFIX_ASSIGNEES || 'user:63,user:1,user:43,user:7')
  .split(',').map((s) => s.trim()).filter(Boolean);

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
export async function createTask({ name, description, contactId }) {
  if (!TOKEN) throw new Error('PLANFIX_API_TOKEN не задан');

  const body = {
    name: String(name).slice(0, 250),
    description,
    template: { id: TEMPLATE_ID },
    assignees: { users: ASSIGNEES.map((id) => ({ id })) },
  };
  if (PROJECT_ID) body.project = { id: PROJECT_ID };
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
  return `[${ticketNo}] ${priority} · ${fields.clinic} / ${fields.module} — ${short}`;
}
