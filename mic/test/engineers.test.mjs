// Реестр инженеров: разбор команды, код, логины, подписка «все». Запуск: npm run engineers:test
process.env.BOT_ENGINEER_CODE = 'k1';
process.env.BOT_ENGINEER_LOGINS = 'figol_rs';
const { parseCommand, Engineers, ALL } = await import('../bot/engineers.mjs');
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

let failed = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`); if (!cond) failed++; };

console.log('разбор команды');
check('не команда', parseCommand('заявка') === null && parseCommand('инженерия') === null);
check('без аргументов — подсказка', parseCommand('инженер')?.help === true);
check('логин и код', JSON.stringify(parseCommand('  /Инженер  kasimov_dv  k1 ')) === '{"login":"kasimov_dv","all":false,"code":"k1"}');
check('«все»', parseCommand('engineer все k1')?.login === ALL && parseCommand('engineer все k1')?.all === true);
check('логин + все', JSON.stringify(parseCommand('инженер figol_rs все k1')) === '{"login":"figol_rs","all":true,"code":"k1"}');
check('стоп', parseCommand('инженер стоп')?.stop === true);

console.log('реестр');
const file = join(tmpdir(), `eng-${process.pid}.json`);
const reg = new Engineers(file);
await reg.load();
check('неверный код', !(await reg.register({ login: 'kasimov_dv', code: 'x' }, { userId: 1 })).ok);
check('чужой логин', !(await reg.register({ login: 'hacker', code: 'k1' }, { userId: 1 })).ok);
check('инженер из таблицы', (await reg.register({ login: 'kasimov_dv', code: 'k1' }, { userId: 1, name: 'Касимов' })).ok);
check('логин из BOT_ENGINEER_LOGINS', (await reg.register({ login: 'figol_rs', code: 'k1' }, { userId: 2 })).ok);
check('«все»', (await reg.register({ login: ALL, code: 'k1' }, { userId: 3 })).ok);
check('логин + все', (await reg.register({ login: 'figol_rs', all: true, code: 'k1' }, { userId: 4 })).ok && reg.byUserId(4).login === 'figol_rs');
check('адресаты по логину: сам + «все» + «логин все»', reg.targetsFor('kasimov_dv').map((e) => e.userId).join() === '1,3,4', reg.targetsFor('kasimov_dv').map((e) => e.userId).join());
check('без логина — только подписанные на всё', reg.targetsFor(null).map((e) => e.userId).join() === '3,4');
check('повторная регистрация заменяет', (await reg.register({ login: 'deravchuk', code: 'k1' }, { userId: 1 })).ok && reg.byUserId(1).login === 'deravchuk' && reg.list.length === 4);
check('отписка', (await reg.unregister(1)).ok && !reg.byUserId(1) && !(await reg.unregister(1)).ok);
const again = new Engineers(file); await again.load();
check('переживает перезапуск', again.list.length === 3);
await rm(file, { force: true });

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nРеестр инженеров в порядке');
process.exit(failed ? 1 : 0);
