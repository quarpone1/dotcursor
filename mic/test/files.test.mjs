// Имена вложений из MAX: расширение по типу/сигнатуре, нумерация одинаковых.
// Запуск: npm run files:test
import { withExtension, uniqueNames } from '../bot/max-api.mjs';
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' — ' + extra}`); if (!cond) failed++; };
const jpg = Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), Buffer.alloc(8)]);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(8)]);
const mp4 = Buffer.concat([Buffer.from('00000018', 'hex'), Buffer.from('ftypisom'), Buffer.alloc(8)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8)]);
check('фото без имени → .jpg по Content-Type', withExtension('изображение', 'image/jpeg', jpg) === 'изображение.jpg');
check('octet-stream → по сигнатуре png', withExtension('изображение', 'application/octet-stream', png) === 'изображение.png');
check('видео по сигнатуре', withExtension('видео', null, mp4) === 'видео.mp4');
check('pdf по сигнатуре', withExtension('файл', '', pdf) === 'файл.pdf');
check('имя с расширением не трогаем', withExtension('kassa.log', 'application/octet-stream', Buffer.alloc(20)) === 'kassa.log');
check('скриншот.PNG тоже оставляем', withExtension('скриншот.PNG', 'image/png', png) === 'скриншот.PNG');
check('неизвестный тип — без расширения', withExtension('файл', 'application/x-foo', Buffer.alloc(20)) === 'файл');
check('пустое имя → файл', withExtension('', 'image/png', png) === 'файл.png');
const fs = [{ name: 'изображение.jpg' }, { name: 'изображение.jpg' }, { name: 'лог.txt' }, { name: 'изображение.jpg' }, { name: 'файл' }, { name: 'файл' }];
uniqueNames(fs);
check('одинаковые нумеруются перед расширением', fs.map((f) => f.name).join(',') === 'изображение.jpg,изображение (2).jpg,лог.txt,изображение (3).jpg,файл,файл (2)', fs.map((f) => f.name).join(','));
console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : '\nИмена вложений в порядке');
process.exit(failed ? 1 : 0);
