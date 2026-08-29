// Диалог заявки в терминале — как он будет выглядеть в MAX, но без MAX.
// Запуск: npm run dialog:demo
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createSession, start, handle, summary } from '../bot/dialog.mjs';

// Если ввод пришёл пайпом, readline отдаёт строки рывками — в этом режиме
// проще прочитать всё разом и проиграть как сценарий.
const INTERACTIVE = stdin.isTTY;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bot = (s) => `\x1b[36m${s}\x1b[0m`;

const session = createSession({ id: 0, name: 'Демо' });
let buttons = [];

function show(messages) {
  for (const m of messages) {
    console.log('\n' + bot('Бот:') + ' ' + m.text.replace(/\n/g, '\n     '));
    const flat = (m.buttons || []).flat();
    if (flat.length) {
      buttons = flat;
      console.log(dim('     ' + flat.map((b, i) => `[${i + 1}] ${b.text}`).join('  ')));
    } else if (m.buttons) {
      buttons = [];
    }
  }
}

function step(line) {
  if (line.startsWith('/file ')) {
    const name = line.slice(6).trim() || 'файл.png';
    return handle(session, { type: 'attachment', file: { name, size: 1024 * 512 } });
  }
  if (/^\d+$/.test(line) && buttons[Number(line) - 1]) {
    const b = buttons[Number(line) - 1];
    console.log(dim(`     (нажали «${b.text}»)`));
    return handle(session, { type: 'callback', payload: b.payload });
  }
  return handle(session, { type: 'text', text: line });
}

function finish(result) {
  if (result.done) {
    console.log(dim('\n— в Planfix уйдёт ровно этот текст, одним сообщением —'));
    console.log(summary(session));
    return true;
  }
  return result.cancelled;
}

console.log(dim('Отвечайте текстом или номером кнопки в квадратных скобках.'));
console.log(dim('«/file имя.png» — приложить файл, «/quit» — выйти.\n'));

show(start(session));

if (!INTERACTIVE) {
  const chunks = [];
  for await (const c of stdin) chunks.push(c);
  for (const raw of Buffer.concat(chunks).toString('utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line === '/quit') continue;
    console.log(`\nВы: ${line}`);
    const result = step(line);
    show(result.replies);
    if (finish(result)) break;
  }
} else {
  const rl = createInterface({ input: stdin, output: stdout });
  while (true) {
    let line;
    try { line = (await rl.question('\nВы: ')).trim(); } catch { break; }
    if (line === undefined || line === '/quit') break;
    const result = step(line);
    show(result.replies);
    if (finish(result)) break;
  }
  rl.close();
}
