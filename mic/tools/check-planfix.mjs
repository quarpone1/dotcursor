// Разведка REST API Planfix перед тем, как переводить бота на создание задач.
// Запуск: npm run planfix:check
//
// Проверяем три вещи, от которых зависит схема:
//   1. принят ли токен и какие права выданы;
//   2. видим ли контакты (нужно, чтобы привязать задачу к автору заявки);
//   3. создаётся ли задача (только с --create, иначе ничего не трогаем).
const TOKEN = process.env.PLANFIX_API_TOKEN;
const ACCOUNT = process.env.PLANFIX_ACCOUNT || 'sensey';
const BASE = process.env.PLANFIX_API_BASE || `https://${ACCOUNT}.planfix.ru/rest`;
const create = process.argv.includes('--create');

if (!TOKEN) {
  console.error('✗ PLANFIX_API_TOKEN не задан.');
  console.error('  Заводится в Planfix: Управление аккаунтом → Доступ к API → REST API.');
  console.error('  Нужны права (scope): task_add, contact_readonly.');
  process.exit(1);
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
  return { status: res.status, ok: res.ok, json, text };
}

let failed = false;
const step = (ok, msg, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${msg}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed = true;
};

console.log(`Аккаунт: ${BASE}\n`);

const scopeDenied = (r) => r.status === 405 || /scope denied/i.test(r.text);

/* 1. Токен. Пробуем то, на что права точно выданы, а не что попало:
      «Scope denied» — это уже признак живого токена, просто метод не разрешён. */
const probe = await pf('GET', '/user/current');
if (probe.status === 401 || /unknown token/i.test(probe.text)) {
  step(false, 'Токен не принят', probe.text.slice(0, 200));
  console.error('\n  Токен неверный или отозван — выпустите заново.');
  process.exit(1);
}
step(true, scopeDenied(probe)
  ? 'Токен принят (чтение пользователя не разрешено — это нормально при узких правах)'
  : `Токен принят, пользователь: ${probe.json?.user?.name || probe.json?.name || 'неизвестен'}`);

/* 2. Контакты — по ним привяжем заявку к автору */
const contacts = await pf('POST', '/contact/list', {
  offset: 0, pageSize: 3, fields: 'id,name,email,phones',
});
if (contacts.ok) {
  const list = contacts.json?.contacts || [];
  step(true, `Контакты читаются, всего в выборке: ${list.length}`);
  for (const c of list.slice(0, 3)) console.log(`    · ${c.id} — ${c.name || '(без имени)'}`);
} else if (scopeDenied(contacts)) {
  step(false, 'Контакты закрыты правами токена', contacts.text.slice(0, 160));
  console.log('    Добавьте scope contact_readonly — без него задачу не привязать');
  console.log('    к автору заявки, и ответы инженера не найдут дорогу в MAX.');
} else {
  step(false, 'Контакты недоступны', `HTTP ${contacts.status} ${contacts.text.slice(0, 200)}`);
}

/* 3. Создание задачи — только по явному требованию */
if (!create) {
  console.log('\nСоздание задачи не проверял. Чтобы проверить (создаст тестовую задачу):');
  console.log('  npm run planfix:check -- --create');
} else {
  const r = await pf('POST', '/task/', {
    name: 'ТЕСТ интеграции — задачу можно закрыть',
    description: 'Проверка создания задачи через REST API. Реальной проблемы нет.',
  });
  if (r.ok) {
    step(true, `Задача создаётся, id ${r.json?.id ?? '?'}`);
    console.log('    Проверьте её в Planfix и закройте.');
  } else if (scopeDenied(r)) {
    step(false, 'Создание задач закрыто правами токена', r.text.slice(0, 160));
    console.log('    Добавьте scope task_add.');
  } else {
    step(false, 'Задача не создалась', `HTTP ${r.status} ${r.text.slice(0, 300)}`);
    console.log('    Скорее всего не хватает обязательного поля — покажите этот вывод.');
  }
}

console.log(failed ? '\nЕсть проблемы — смотрите строки со знаком ✗' : '\nPlanfix API готов.');
process.exit(failed ? 1 : 0);
