// Прогон сценария диалога без сети: полный путь, правки, отмена, лимиты.
// Запуск: npm run dialog:test
import { createSession, start, handle, summary, STEPS, MAX_FILES } from '../bot/dialog.mjs';

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' — ' + extra}`);
  if (!cond) failed++;
};

const text = (s, t) => handle(s, { type: 'text', text: t });
const tap = (s, payload) => handle(s, { type: 'callback', payload });
const file = (s, name, size = 1024) => handle(s, { type: 'attachment', file: { name, size } });
const last = (r) => r.replies[r.replies.length - 1];
const btnPayloads = (msg) => (msg.buttons || []).flat().map((b) => b.payload);
const stepIdx = (id) => STEPS.findIndex((s) => s.id === id);

/* --- 1. Полный путь --- */
console.log('\n1. Полный путь до подтверждения');
{
  const s = createSession({ id: 1, name: 'Иванов' });
  const first = start(s)[0];
  check('первый вопрос — клиника', /клиник/i.test(first.text), first.text.slice(0, 40));
  check('клиники кнопками', btnPayloads(first).some((p) => p.startsWith('c:clinic:')));
  check('на первом шаге нет «Назад»', !btnPayloads(first).includes('nav:back'));

  tap(s, 'c:clinic:0');
  check('клиника записана', s.answers.clinic === 'МедГород', s.answers.clinic);
  const r2 = tap(s, 'c:module:0');
  check('модуль записан, дальше текстовый вопрос', s.answers.module === 'ЭМК' && /Кто столкнулся/.test(last(r2).text));

  const short = text(s, 'ИИ');
  check('короткое ФИО отклонено', /Слишком коротко/.test(short.replies[0].text));
  check('шаг не сдвинулся', s.answers.user === undefined);

  text(s, 'Иванов А. А. / логин 123');
  check('ФИО принято', s.answers.user === 'Иванов А. А. / логин 123');

  const skipped = tap(s, 'skip');
  check('пациент пропускается', s.answers.patient === '' && /суть ошибки/i.test(last(skipped).text));

  text(s, 'Не печатается чек на кассе');
  text(s, '1. Открыть смену\n2. Пробить услугу\n3. Нажать «Печать чека»');
  text(s, 'Окно с ошибкой драйвера');
  text(s, 'Чек печатается');
  const afterUrg = tap(s, 'c:urgency:0');
  check('срочность записана', s.answers.urgency === 'Блокирует работу (полный отказ)');
  check('дальше спрашивают контакт', /связаться/i.test(last(afterUrg).text));

  const afterContact = text(s, '+7 900 000-00-00');
  check('дошли до вложений', /Приложите/.test(last(afterContact).text));
  check('есть кнопка «Без файлов»', btnPayloads(last(afterContact)).includes('files:done'));

  file(s, 'скрин.png');
  const afterFile2 = file(s, 'лог.txt');
  check('файлы копятся', s.files.length === 2);
  check('счётчик виден', /Приложено: 2/.test(last(afterFile2).text), last(afterFile2).text.slice(-60));

  const conf = tap(s, 'files:done');
  check('перешли к подтверждению', s.phase === 'confirm');
  check('в карточке видны кнопки отправки', btnPayloads(last(conf)).includes('ok:send'));

  const card = summary(s);
  check('карточка содержит все поля',
    /Клиника: МедГород/.test(card) && /Модуль: ЭМК/.test(card) &&
    /Не печатается чек/.test(card) && /Вложения \(2\)/.test(card));
  check('пропущенный пациент не попал в карточку', !/Пациент:/.test(card));
  check('карточка помечена источником', /бот MAX/.test(card));

  const sent = tap(s, 'ok:send');
  check('заявка закрыта', s.phase === 'done');
  check('пользователю показан номер и приоритет',
    new RegExp(s.ticketNo).test(sent.replies[0].text) && /P0\/P1/.test(sent.replies[0].text));
  check('done выставлен', sent.done === true);

  const after = text(s, 'ещё что-то');
  check('после отправки диалог не продолжается', /уже закрыта/.test(after.replies[0].text));
}

/* --- 2. Кнопка «Назад» --- */
console.log('\n2. Возврат на шаг назад');
{
  const s = createSession();
  start(s);
  tap(s, 'c:clinic:0');
  tap(s, 'c:module:1');
  check('мы на вопросе о пользователе', s.stepIndex === stepIdx('user'));
  const back = tap(s, 'nav:back');
  check('вернулись к модулю', s.stepIndex === stepIdx('module') && /модул/i.test(last(back).text));
  tap(s, 'c:module:2');
  check('новый ответ перезаписал старый', s.answers.module === 'Касса', s.answers.module);
}

/* --- 3. Правка поля из подтверждения --- */
console.log('\n3. Правка одного поля');
{
  const s = createSession();
  start(s);
  tap(s, 'c:clinic:0');
  tap(s, 'c:module:0');
  text(s, 'Иванов А. А. / логин 123');
  tap(s, 'skip');
  text(s, 'Не печатается чек');
  text(s, '1. Открыть смену 2. Пробить услугу');
  text(s, 'Ошибка драйвера');
  text(s, 'Чек печатается');
  tap(s, 'c:urgency:1');
  text(s, '+7 900 000-00-00');
  tap(s, 'files:done');
  check('подтверждение показано', s.phase === 'confirm');

  const menu = tap(s, 'ok:edit');
  check('меню правки открылось', s.phase === 'editing' && btnPayloads(last(menu)).some((p) => p.startsWith('edit:')));

  const edit = tap(s, 'edit:clinic');
  check('спросили именно клинику', s.editing === 'clinic' && /клиник/i.test(last(edit).text));

  const done = tap(s, 'c:clinic:8');
  check('клиника заменена', s.answers.clinic === 'ТГМУ', s.answers.clinic);
  check('вернулись сразу к подтверждению, а не пошли по кругу',
    s.phase === 'confirm' && s.editing === null);
  check('остальные ответы целы', s.answers.title === 'Не печатается чек' && s.answers.urgency.startsWith('Мешает'));
  check('в карточке новая клиника', /Клиника: ТГМУ/.test(last(done).text));
}

/* --- 4. Отмена --- */
console.log('\n4. Отмена');
{
  const s = createSession();
  start(s);
  tap(s, 'c:clinic:0');
  const c = tap(s, 'nav:cancel');
  check('диалог отменён', s.phase === 'cancelled' && c.cancelled === true);
  check('сказано, что ничего не ушло', /ничего никуда не ушло/.test(c.replies[0].text));

  const s2 = createSession();
  start(s2);
  const c2 = text(s2, 'отмена');
  check('словом «отмена» тоже отменяется', s2.phase === 'cancelled', String(c2.cancelled));
}

/* --- 5. Вложения: лимит и файл не вовремя --- */
console.log('\n5. Вложения');
{
  const s = createSession();
  start(s);
  const early = file(s, 'скрин-заранее.png');
  check('файл до шага вложений не теряется', s.files.length === 1);
  check('пользователю сказали, что файл принят', /запомнил/.test(early.replies[0].text));
  check('шаг при этом не сдвинулся', s.stepIndex === 0);

  s.stepIndex = stepIdx('files');
  for (let i = s.files.length; i < MAX_FILES; i++) file(s, `f${i}.png`);
  check(`набрали ${MAX_FILES} файлов`, s.files.length === MAX_FILES);
  const over = file(s, 'лишний.png');
  check('сверх лимита не принимается', s.files.length === MAX_FILES);
  check('про лимит сказано', new RegExp(`Уже ${MAX_FILES}`).test(over.replies[0].text));
}

/* --- 6. Ответ текстом вместо кнопки --- */
console.log('\n6. Текст вместо кнопки');
{
  const s = createSession();
  start(s);
  const wrong = text(s, 'какая-то клиника');
  check('чужой вариант не принят', s.answers.clinic === undefined && /кнопкой/.test(wrong.replies[0].text));
  text(s, 'тгму');
  check('точное название принято даже в другом регистре', s.answers.clinic === 'ТГМУ', s.answers.clinic);
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nСценарий диалога проходит целиком');
process.exit(failed ? 1 : 0);
