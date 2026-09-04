// Прогон сценария диалога без сети: оба типа заявки, правки, отмена, лимиты.
// Запуск: npm run dialog:test
import { createSession, start, handle, summary, activeSteps, MAX_FILES } from '../bot/dialog.mjs';

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
const stepIdx = (s, id) => activeSteps(s).findIndex((x) => x.id === id);

// Доводит ошибку до шага вложений — общий разгон для нескольких сценариев
function bugUpToFiles(s) {
  start(s);
  tap(s, 'c:kind:0');
  tap(s, 'c:clinic:0');
  tap(s, 'c:module:0');
  tap(s, 'c:role:0');
  text(s, 'Иванов А. А. / логин 123');
  tap(s, 'skip');
  text(s, 'Не печатается чек на кассе');
  text(s, '1. Открыть смену\n2. Пробить услугу\n3. Нажать «Печать чека»');
  text(s, 'Окно с ошибкой драйвера');
  text(s, 'Чек печатается');
  tap(s, 'c:urgency:0');
  return text(s, '+7 900 000-00-00');
}

/* --- 1. Ошибка: полный путь --- */
console.log('\n1. Ошибка — полный путь до подтверждения');
{
  const s = createSession({ id: 1, name: 'Иванов' });
  const first = start(s)[0];
  check('первый вопрос — что оформляем', /Что оформляем/.test(first.text), first.text.slice(0, 40));
  check('два типа кнопками', btnPayloads(first).includes('c:kind:0') && btnPayloads(first).includes('c:kind:1'));
  check('на первом шаге нет «Назад»', !btnPayloads(first).includes('nav:back'));

  const r1 = tap(s, 'c:kind:0');
  check('тип записан, дальше клиника', s.answers.kind === 'Ошибка' && /клиник/i.test(last(r1).text));
  check('у ошибки 13 шагов', activeSteps(s).length === 13, String(activeSteps(s).length));

  tap(s, 'c:clinic:0');
  const r2 = tap(s, 'c:module:0');
  check('модуль записан, дальше роль', s.answers.module === 'ЭМК' && /роль/i.test(last(r2).text));

  const r3 = tap(s, 'c:role:0');
  check('роль кнопкой', s.answers.role === 'Врач' && /Кто столкнулся/.test(last(r3).text));

  const short = text(s, 'ИИ');
  check('короткое ФИО отклонено', /Слишком коротко/.test(short.replies[0].text));
  check('шаг не сдвинулся', s.answers.user === undefined);

  text(s, 'Иванов А. А. / логин 123');
  check('ФИО принято', s.answers.user === 'Иванов А. А. / логин 123');

  const patientAsk = last({ replies: [handle(s, { type: 'text', text: '' }).replies[1]] });
  check('пациента спрашивают карту и КБП', /карты и КБП/.test(patientAsk.text), patientAsk.text.slice(0, 60));
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
    /· ошибка/.test(card) && /Клиника: МедГород/.test(card) && /Роль: Врач/.test(card) &&
    /Не печатается чек/.test(card) && /Шаги воспроизведения/.test(card) && /Вложения \(2\)/.test(card),
    card.slice(0, 120));
  check('пропущенный пациент не попал в карточку', !/Пациент/.test(card));
  check('поля доработки в карточке ошибки нет', !/Что нужно сделать/.test(card));

  const sent = tap(s, 'ok:send');
  check('заявка закрыта', s.phase === 'done');
  check('пользователю показан номер и приоритет',
    new RegExp(s.ticketNo).test(sent.replies[0].text) && /P0\/P1/.test(sent.replies[0].text));

  const after = text(s, 'ещё что-то');
  check('после отправки диалог не продолжается', /уже закрыта/.test(after.replies[0].text));
}

/* --- 2. Доработка: свой набор полей --- */
console.log('\n2. Доработка — свой набор полей');
{
  const s = createSession();
  start(s);
  const r = tap(s, 'c:kind:1');
  check('тип — доработка', s.answers.kind === 'Доработка');
  check('у доработки 11 шагов', activeSteps(s).length === 11, String(activeSteps(s).length));
  check('в нумерации это отражено', /из 11/.test(last(r).text), last(r).text.slice(0, 20));

  const cl = tap(s, 'c:clinic:1');
  check('вопрос про модуль сформулирован под доработку', /касается доработка/.test(last(cl).text), last(cl).text.slice(0, 60));
  tap(s, 'c:module:1');
  tap(s, 'c:role:3');
  const u = text(s, 'Петрова Н. И. / логин 45');
  check('пациента у доработки не спрашивают', /суть доработки/i.test(last(u).text), last(u).text.slice(0, 50));

  const t = text(s, 'Добавить печать направления из ЭМК');
  check('дальше — что нужно сделать', /Что именно нужно/.test(last(t).text));
  const tooShort = text(s, 'кнопку');
  check('короткое описание доработки отклонено', /подробнее/i.test(tooShort.replies[0].text));
  text(s, 'В карточке осмотра кнопка «Печать направления», форма 057/у');
  const rsn = text(s, 'Сейчас печатаем из Word вручную, теряем 5 минут на пациента');
  check('после «зачем» — срочность', /срочно/i.test(last(rsn).text));

  tap(s, 'c:urgency:1');
  text(s, 'почта p@clinic.ru');
  tap(s, 'files:done');
  check('дошли до подтверждения', s.phase === 'confirm');

  const card = summary(s);
  check('карточка помечена как доработка', /· доработка/.test(card) && /Доработка: Добавить печать/.test(card));
  check('в карточке «что нужно» и «зачем»',
    /Что нужно сделать:/.test(card) && /057\/у/.test(card) && /Зачем/.test(card) && /Word/.test(card));
  check('полей ошибки в карточке нет', !/Шаги воспроизведения/.test(card) && !/Фактический результат/.test(card));
}

/* --- 3. Роль своим текстом --- */
console.log('\n3. Роль — свой вариант текстом');
{
  const s = createSession();
  start(s);
  tap(s, 'c:kind:0'); tap(s, 'c:clinic:0'); tap(s, 'c:module:0');
  const r = text(s, 'Старшая медсестра приёмного');
  check('свободный текст принят как роль', s.answers.role === 'Старшая медсестра приёмного', s.answers.role);
  check('и диалог пошёл дальше', /Кто столкнулся/.test(last(r).text));

  const s2 = createSession();
  start(s2);
  tap(s2, 'c:kind:0'); tap(s2, 'c:clinic:0'); tap(s2, 'c:module:0');
  text(s2, 'врач');
  check('совпадение с кнопкой нормализуется', s2.answers.role === 'Врач', s2.answers.role);
}

/* --- 4. Смена типа через «Назад» --- */
console.log('\n4. Смена типа через «Назад»');
{
  const s = createSession();
  start(s);
  tap(s, 'c:kind:0');
  tap(s, 'c:clinic:0');
  tap(s, 'nav:back');
  const back = tap(s, 'nav:back');
  check('вернулись к выбору типа', /Что оформляем/.test(last(back).text));
  tap(s, 'c:kind:1');
  check('тип сменился и шагов стало 11', s.answers.kind === 'Доработка' && activeSteps(s).length === 11);
}

/* --- 5. Кнопка «Назад» и правка --- */
console.log('\n5. Возврат и правка поля');
{
  const s = createSession();
  start(s);
  tap(s, 'c:kind:0');
  tap(s, 'c:clinic:0');
  tap(s, 'c:module:1');
  check('мы на вопросе о роли', s.stepIndex === stepIdx(s, 'role'));
  const back = tap(s, 'nav:back');
  check('вернулись к модулю', s.stepIndex === stepIdx(s, 'module') && /модул/i.test(last(back).text));
  tap(s, 'c:module:2');
  check('новый ответ перезаписал старый', s.answers.module === 'Касса', s.answers.module);

  const s2 = createSession();
  bugUpToFiles(s2);
  tap(s2, 'files:done');
  const menu = tap(s2, 'ok:edit');
  check('меню правки открылось', s2.phase === 'editing' && btnPayloads(last(menu)).some((p) => p.startsWith('edit:')));
  check('в меню правки нет полей доработки', !btnPayloads(last(menu)).includes('edit:wish'));
  tap(s2, 'edit:clinic');
  const done = tap(s2, 'c:clinic:8');
  check('клиника заменена и вернулись к подтверждению',
    s2.answers.clinic === 'ТГМУ' && s2.phase === 'confirm' && /Клиника: ТГМУ/.test(last(done).text));
}

/* --- 6. Отмена --- */
console.log('\n6. Отмена');
{
  const s = createSession();
  start(s);
  tap(s, 'c:kind:0');
  const c = tap(s, 'nav:cancel');
  check('диалог отменён', s.phase === 'cancelled' && c.cancelled === true);
  const s2 = createSession();
  start(s2);
  const c2 = text(s2, 'отмена');
  check('словом «отмена» тоже отменяется', s2.phase === 'cancelled', String(c2.cancelled));
}

/* --- 7. Вложения --- */
console.log('\n7. Вложения');
{
  const s = createSession();
  start(s);
  const early = file(s, 'скрин-заранее.png');
  check('файл до шага вложений не теряется', s.files.length === 1);
  check('пользователю сказали, что файл принят', /запомнил/.test(early.replies[0].text));
  check('шаг при этом не сдвинулся', s.stepIndex === 0);

  bugUpToFiles(s);
  for (let i = s.files.length; i < MAX_FILES; i++) file(s, `f${i}.png`);
  check(`набрали ${MAX_FILES} файлов`, s.files.length === MAX_FILES);
  const over = file(s, 'лишний.png');
  check('сверх лимита не принимается', s.files.length === MAX_FILES);
  check('про лимит сказано', new RegExp(`Уже ${MAX_FILES}`).test(over.replies[0].text));
}

/* --- 8. Текст вместо кнопки --- */
console.log('\n8. Текст вместо кнопки');
{
  const s = createSession();
  start(s);
  const wrong = text(s, 'какая-то ерунда');
  check('чужой вариант не принят', s.answers.kind === undefined && /кнопкой/.test(wrong.replies[0].text));
  text(s, 'ошибка');
  check('точное название принято даже в другом регистре', s.answers.kind === 'Ошибка', s.answers.kind);
}

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nСценарий диалога проходит целиком');
process.exit(failed ? 1 : 0);
