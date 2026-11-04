// Сверка старых заявок перед переключением. По умолчанию чтение; --apply переносит
// остатки MIC и снимает исключительно старую машинную видимость MIC.
// Запускать при остановленном mis-bot. Запись состояния делает бот при старте.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import * as yt from '../bot/youtrack.mjs';
if(!yt.clinicRouting)throw Error('Нужен YOUTRACK_ROUTING=clinics');
const apply=process.argv.includes('--apply');
const file=join(process.env.BOT_STATE_DIR||new URL('../data',import.meta.url).pathname,'bot-tickets.json');
const tickets=JSON.parse(await readFile(file,'utf8'));
await yt.loadProject();
let moved=0,visibility=0,missing=0;
for(const t of tickets.filter(t=>t.ytId)){
 let info;
 try{info=await yt.issueInfo(t.ytId);}catch(e){if(e.status===404){missing++;continue;}throw e;}
 const clinic=t.clinic||info.clinic;
 if(!clinic){console.log(`${info.key}: клиника не определена, пропуск`);continue;}
 const target=yt.projectFor(clinic);
 if(info.project==='MIC'){
  console.log(`${info.key} → ${target}`);
  if(apply){info=await yt.moveIssue(info.id,clinic);moved++;}
 }else if(info.project!==target){console.log(`${info.key}: находится в ${info.project}, ожидается ${target}; ручной перенос сохраняется`);continue;}
 if(info.project===target && apply && await yt.clearLegacyVisibility(info,clinic))visibility++;
 console.log(`${t.ytKey} → ${info.key}`);
}
console.log(JSON.stringify({apply,moved,visibility,missing}));
