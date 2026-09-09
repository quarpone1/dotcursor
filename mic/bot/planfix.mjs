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
// Шаблон «Заявка на Сопровождение МИЦ» — заведён разработчиком под проект 16521.
const TEMPLATE_ID = Number(process.env.PLANFIX_TEMPLATE_ID || 16657);
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

/* ---------- пользовательские поля шаблона ----------
   Поля заводятся в Planfix руками (API не даёт), а бот находит их по имени.
   Слева — ключ из ответов заявки, справа — как поле может называться. */
export const FIELD_NAMES = {
  ticketNo: ['Номер заявки', '№ заявки'],
  kind:     ['Тип заявки', 'Тип'],
  clinic:   ['Клиника', 'Объект'],
  module:   ['Модуль МИС', 'Модуль'],
  role:     ['Роль'],
  urgency:  ['Срочность'],
  patient:  ['Пациент', 'Пациент (карта / КБП)'],
  contact:  ['Контакт заявителя', 'Контакт'],
  source:   ['Источник'],
};

let fieldMap = null;   // key → {id, name, type}

const normName = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

/** Читает поля задач и сопоставляет с нашими ключами. Вызывается один раз при старте. */
export async function loadFields() {
  fieldMap = {};
  if (!TOKEN) return fieldMap;
  let list = [];
  try {
    const res = await pf('GET', '/customfield/task?fields=id,name,type,directory');
    list = res?.customfields || [];
  } catch (err) {
    console.error('Поля задач не прочитались (нужно право common_metadata):', err.message);
    return fieldMap;
  }
  for (const [key, names] of Object.entries(FIELD_NAMES)) {
    const wanted = names.map(normName);
    const hit = list.find((f) => wanted.includes(normName(f.name)));
    if (hit) fieldMap[key] = { id: hit.id, name: hit.name, type: hit.type };
  }
  const found = Object.entries(fieldMap).map(([k, f]) => `${k}→«${f.name}»`).join(', ');
  const missing = Object.keys(FIELD_NAMES).filter((k) => !fieldMap[k]);
  console.log(`Поля шаблона: ${found || 'ни одного'}${missing.length ? `; не нашлись: ${missing.join(', ')}` : ''}`);
  return fieldMap;
}

/** customFieldData для создания задачи по значениям заявки. Пустые пропускаем. */
export function customFieldData(values) {
  if (!fieldMap) return [];
  const out = [];
  for (const [key, f] of Object.entries(fieldMap)) {
    const v = values[key];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    out.push({ field: { id: f.id }, value: String(v).slice(0, 1000) });
  }
  return out;
}

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

/**
 * Скачивает файл Planfix по id. Нужно право file_readonly.
 * Planfix может отдать и сам бинарник, и JSON со ссылкой — принимаем оба варианта.
 */
export async function downloadFile(fileId) {
  const res = await fetch(`${BASE}/file/${fileId}/download`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Planfix download ${fileId}: ${res.status} ${(await res.text()).slice(0, 150)}`);
  const ct = res.headers.get('content-type') || '';
  if (/application\/json/.test(ct)) {
    const j = await res.json();
    const url = j?.url || j?.downloadUrl || j?.file?.url;
    if (!url) throw new Error(`Planfix download ${fileId}: JSON без ссылки`);
    const r2 = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r2.ok) throw new Error(`Planfix download ${fileId}: ссылка отдала ${r2.status}`);
    return Buffer.from(await r2.arrayBuffer());
  }
  return Buffer.from(await res.arrayBuffer());
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
    fields: 'id,dateTime,type,owner,description,recipients,isDeleted,files',
  });
  const all = res?.comments || [];
  return all
    .filter((c) => !c.isDeleted && Number(c.id) > Number(sinceId))
    .filter((c) => String(c.owner?.id || '').startsWith('user:'))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// Метка наших же комментариев: по ней они не уедут обратно человеку как «ответ инженера».
export const FROM_MAX_MARK = '💬 Из MAX';

/** Наш ли это комментарий (написан ботом от имени человека из MAX). */
export function isOwnComment(comment) {
  return String(comment?.description || '').replace(/<[^>]+>/g, '').trim().startsWith(FROM_MAX_MARK);
}

/**
 * Комментарий в задачу от имени человека из MAX.
 * Владельцем пытаемся поставить его контакт; если Planfix не даст —
 * автором будет пользователь токена, а кто писал, видно по метке в тексте.
 */
export async function addComment(taskId, text, { contactId = null, fileIds = [] } = {}) {
  const body = { description: String(text).replace(/\n/g, '<br>') };
  if (fileIds.length) body.files = fileIds.map((id) => ({ id }));
  if (contactId) body.owner = { id: `contact:${contactId}` };
  try {
    const res = await pf('POST', `/task/${taskId}/comments/`, body);
    return res?.id ?? true;
  } catch (err) {
    // Planfix мог отвергнуть владельца-контакта — повторяем без него
    if (contactId && err.status === 400) {
      delete body.owner;
      const res = await pf('POST', `/task/${taskId}/comments/`, body);
      return res?.id ?? true;
    }
    throw err;
  }
}

/** Адресован ли комментарий клиенту — по нему решаем, пересылать ли в MAX. */
export function addressedToContact(comment, contactId) {
  if (!contactId) return false;
  const users = comment?.recipients?.users || [];
  if (!users.length) return true;            // без адресатов — считаем общим
  return users.some((u) => String(u.id) === `contact:${contactId}`);
}

export async function createTask({ name, description, contactId, fileIds = [], clinic = null, fields = null }) {
  if (!TOKEN) throw new Error('PLANFIX_API_TOKEN не задан');

  const body = {
    name: String(name).slice(0, 250),
    description,
    template: { id: TEMPLATE_ID },
    assignees: { users: assigneesFor(clinic).map((id) => ({ id })) },
  };
  const cfd = fields ? customFieldData(fields) : [];
  if (cfd.length) body.customFieldData = cfd;
  if (PROJECT_ID) body.project = { id: PROJECT_ID };
  if (fileIds.length) body.files = fileIds.map((id) => ({ id }));
  if (contactId) {
    const ref = { id: `contact:${contactId}` };
    body.counterparty = ref;   // клиент, по нему Planfix адресует ответ
    body.assigner = ref;       // автор заявки — тот же человек
  }

  // Поле может не приняться (не добавлено в шаблон, не тот тип, нет такого
  // варианта в списке). Задача важнее полей: отбрасываем только отвергнутое
  // и пробуем снова, пока Planfix не примет. В лог — каждое выброшенное.
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const res = await pf('POST', '/task/', body);
      return res?.id ?? null;
    } catch (err) {
      if (!body.customFieldData?.length || err.status !== 400) throw err;
      const m = /by id - (\d+)/.exec(err.message);
      const badId = m ? Number(m[1]) : null;
      const bad = body.customFieldData.find((x) => x.field.id === badId);
      if (bad) {
        console.error(`Planfix отверг поле ${badId} («${fieldNameById(badId)}» = ${JSON.stringify(bad.value)}) — создаю без него.`);
        body.customFieldData = body.customFieldData.filter((x) => x.field.id !== badId);
      } else {
        console.error(`Planfix отверг поля задачи (${err.message.slice(0, 140)}) — создаю без всех.`);
        delete body.customFieldData;
      }
      if (!body.customFieldData?.length) delete body.customFieldData;
    }
  }
  throw new Error('Planfix: задача не создалась после нескольких попыток');
}

function fieldNameById(id) {
  return Object.values(fieldMap || {}).find((f) => f.id === id)?.name || '?';
}

/** Заголовок задачи: номер, приоритет и суть — чтобы список читался с одного взгляда. */
export function taskName({ ticketNo, priority, fields }) {
  const short = String(fields.title || '').replace(/\s+/g, ' ').slice(0, 90);
  const kind = fields.kind === 'Доработка' ? 'Доработка · ' : '';
  return `[${ticketNo}] ${kind}${priority} · ${fields.clinic} / ${fields.module} — ${short}`;
}
