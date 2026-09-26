// Сообщение в канал MAX — для алертов мониторинга (Zabbix, cron, скрипты).
// Отправить:  npm run max:send -- "<b>Сбой</b>: не отвечает МИС"
//             echo "текст" | npm run max:send
// Найти chat_id канала:  npm run max:send -- --chats
//
// Токен — MAX_ALERT_TOKEN (отдельный бот мониторинга) или, если его нет, MAX_BOT_TOKEN.
// Канал — MAX_ALERT_CHAT_ID или --chat <id>. Формат — html, иначе --format markdown|plain.
// Код выхода не 0, если сообщение не ушло: так сбой отправки видно в мониторинге.
import { MaxApi, MAX_API_BASE } from '../bot/max-api.mjs';

const TEXT_LIMIT = 4000; // больше MAX не принимает

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const listChats = args.includes('--chats');
if (listChats) args.splice(args.indexOf('--chats'), 1);
const chatId = opt('--chat') || process.env.MAX_ALERT_CHAT_ID;
const format = opt('--format') || process.env.MAX_ALERT_FORMAT || 'html';

const token = process.env.MAX_ALERT_TOKEN || process.env.MAX_BOT_TOKEN;
if (!token) {
  console.error('✗ Нет токена: задайте MAX_ALERT_TOKEN (или MAX_BOT_TOKEN) в .env');
  process.exit(2);
}
const api = new MaxApi(token);

if (listChats) {
  try {
    const { chats = [] } = await api.chats();
    if (!chats.length) {
      console.log('Бот не состоит ни в одном канале или групповом чате.');
      console.log('Добавьте его в канал администратором с правом публиковать сообщения.');
    }
    for (const c of chats) console.log(`${c.chat_id}\t${c.type || '?'}\t${c.title || ''}`);
    process.exit(0);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

if (!chatId) {
  console.error('✗ Не задан канал: MAX_ALERT_CHAT_ID в .env или --chat <id>');
  console.error('  Узнать chat_id: npm run max:send -- --chats');
  process.exit(2);
}

let text = args.join(' ');
if (!text || text === '-') {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  text = Buffer.concat(chunks).toString('utf8');
}
text = text.trim();
if (!text) {
  console.error('✗ Пустое сообщение: передайте текст аргументом или через stdin');
  process.exit(2);
}
if (text.length > TEXT_LIMIT) text = text.slice(0, TEXT_LIMIT - 1) + '…';

try {
  await api.send({ chatId, text, format: format === 'plain' ? undefined : format });
  console.log(`✓ Отправлено в ${chatId}`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (e.status === 401) console.error('  Токен не принят. Заголовок — сам токен, без «Bearer».');
  if (e.status === 404) console.error('  Канал не найден: сверьте chat_id (вместе с минусом) — npm run max:send -- --chats');
  if (e.status === 403) console.error('  Бот в канале, но не может публиковать: выдайте ему права администратора.');
  if (!e.status) console.error(`  API: ${MAX_API_BASE}`);
  process.exit(1);
}
