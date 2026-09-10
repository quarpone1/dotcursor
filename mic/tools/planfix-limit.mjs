// Сколько осталось суточной квоты API Planfix. Стоит один запрос.
// Запуск: npm run planfix:limit
const TOKEN = process.env.PLANFIX_API_TOKEN;
const BASE = `https://${process.env.PLANFIX_ACCOUNT || 'sensey'}.planfix.ru/rest`;
if (!TOKEN) { console.error('✗ PLANFIX_API_TOKEN не задан'); process.exit(1); }

const r = await fetch(`${BASE}/task/templates?fields=id`, {
  headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  signal: AbortSignal.timeout(20_000),
});
const remaining = Number(r.headers.get('x-ratelimit-remaining'));
const reset = Number(r.headers.get('x-ratelimit-reset'));
const text = await r.text();
const resetAt = Number.isFinite(reset) ? new Date(Date.now() + reset * 1000) : null;

console.log(`HTTP ${r.status}`);
if (Number.isFinite(remaining)) console.log(`осталось запросов на сегодня: ${remaining}`);
if (resetAt) console.log(`сброс через ${(reset / 3600).toFixed(1)} ч — ${resetAt.toLocaleString('ru-RU')}`);
if (/rate limit exceeded/i.test(text)) {
  console.log('\n‼ ЛИМИТ ИСЧЕРПАН: бот на паузе до сброса, заявки копятся в очереди.');
  console.log('  ' + text.slice(0, 160));
  process.exit(2);
}
console.log(remaining > 0 ? '\nЛимит не исчерпан, API отвечает.' : '\nAPI отвечает (заголовок remaining не прислан).');
