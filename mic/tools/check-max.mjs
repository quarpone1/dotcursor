// Разведка перед написанием бота: кто мы в MAX и как к боту подключён Planfix.
// Запуск: npm run max:check
const TOKEN = process.env.MAX_BOT_TOKEN;
const BASE = process.env.MAX_API_BASE || 'https://botapi.max.ru';

if (!TOKEN) {
  console.error('✗ MAX_BOT_TOKEN не задан.');
  console.error('  Положите токен бота в .env: MAX_BOT_TOKEN=...');
  console.error('  Взять его можно у @MasterBot в MAX — это тот же ключ, что вы отдали Planfix.');
  process.exit(1);
}

async function max(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: TOKEN, Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}

/* 1. Кто бот */
const me = await max('/me');
if (!me.ok) {
  console.error(`✗ Токен не принят (HTTP ${me.status}): ${me.text.slice(0, 200)}`);
  process.exit(1);
}
console.log(`✓ Бот: ${me.json.name || '?'} @${me.json.username || '?'} (id ${me.json.user_id})`);
if (me.json.description) console.log(`  описание: ${me.json.description}`);

/* 2. Кто слушает события — это и решает архитектуру */
const subs = await max('/subscriptions');
if (!subs.ok) {
  console.log(`\n? Не удалось прочитать подписки (HTTP ${subs.status}): ${subs.text.slice(0, 200)}`);
  process.exit(0);
}

const list = subs.json?.subscriptions || [];
console.log(`\nПодписки на вебхук: ${list.length}`);
for (const s of list) {
  console.log(`  · ${s.url}`);
  if (s.update_types?.length) console.log(`    типы: ${s.update_types.join(', ')}`);
  if (s.time) console.log(`    создана: ${new Date(s.time).toLocaleString('ru-RU')}`);
}

console.log('\n— Что это значит —');
if (list.length === 0) {
  console.log('Вебхуков нет: события можно забирать поллингом (GET /updates).');
  console.log('Значит Planfix получает сообщения как-то иначе — уточните, как он подключён.');
} else {
  console.log('У бота есть вебхук (почти наверняка Planfix). Пока он стоит, наш процесс');
  console.log('НЕ получит события через поллинг — MAX отдаёт их только в вебхук.');
  console.log('Рабочая схема: наш сервис встаёт вебхуком вместо Planfix и сам решает,');
  console.log('что пересылать дальше — промежуточные ответы придерживает, готовый пакет');
  console.log('отдаёт одним куском. Адрес Planfix из списка выше нужен как адрес пересылки.');
}
