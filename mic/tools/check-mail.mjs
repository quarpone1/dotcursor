// Проверка почты: пускает ли SMTP и доходит ли письмо до Planfix.
// Запуск: npm run mail:check            — только подключение
//         npm run mail:check -- --send  — ещё и тестовое письмо в Planfix
import { verifyMail, sendTicketMail } from '../mailer.mjs';

const send = process.argv.includes('--send');

const v = await verifyMail();
if (!v.ok) {
  console.error('✗ SMTP не пускает:', v.error);
  if (/does not have access rights/i.test(v.error)) {
    console.error('\n  Это НЕ про пароль. Яндекс говорит, что у ящика нет доступа к SMTP.');
    console.error('  1) Зайдите на mail.yandex.ru под этим аккаунтом. Если просят');
    console.error('     дозаполнить имя/принять условия — ящик ещё не активирован,');
    console.error('     до этого SMTP не работает.');
    console.error('  2) Настройки → «Почтовые программы» → включить доступ');
    console.error('     по IMAP и разрешить доступ почтовым клиентам.');
    console.error('  3) Пароль приложения должен быть создан именно для «Почты».');
  } else if (/Invalid login|authentication failed/i.test(v.error)) {
    console.error('\n  Похоже на неверный пароль: нужен пароль приложения');
    console.error('  (Яндекс ID → Пароли приложений), а не пароль от аккаунта.');
  }
  process.exit(1);
}
console.log(`✓ SMTP отвечает: ${v.host}, отправитель ${v.from}, получатель ${v.to}`);

if (!send) {
  console.log('\nЧтобы отправить тестовую заявку в Planfix: npm run mail:check -- --send');
  process.exit(0);
}

const ticketNo = `ТП-ТЕСТ-${Math.floor(1000 + Math.random() * 9000)}`;
await sendTicketMail({
  ticketNo,
  priority: 'P3/P4 — низкий',
  sla: 'по плану релизов',
  fields: {
    clinic: 'Проверка связи',
    module: 'Другое',
    title: 'Тестовое письмо, задачу можно закрыть',
    contact: '',
  },
  text: [
    `Заявка ${ticketNo}`,
    '',
    'Это проверка связки «форма → Planfix». Реальной проблемы нет,',
    'задачу можно закрывать.',
  ].join('\n'),
  folder: 'disk:/МИС-заявки/_проверка',
  publicUrl: null,
  attachments: [],
});

console.log(`✓ Письмо ${ticketNo} отправлено на ${v.to}`);
console.log('  Проверьте, появилась ли задача в Planfix. Если нет — адрес отправителя');
console.log('  ещё не заведён в Planfix как контакт/сотрудник.');
