import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
const dir=await mkdtemp(join(tmpdir(),'mic-onboard-')),roster=join(dir,'users.json');
await writeFile(roster,JSON.stringify([{phone:'79001112233',name:'Тест',clinic:'ДОКТОР МИРА'}]));
let sent=[],logs='',bot;
const server=createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;const b=text?JSON.parse(text):{};if(req.url.startsWith('/messages'))sent.push(b);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const bp=probe.address().port;await new Promise(r=>probe.close(r));
async function launch(){
 bot=spawn(process.execPath,['bot/bot.mjs'],{env:{...process.env,MAX_BOT_TOKEN:'fixture-token',MAX_API_BASE:`http://127.0.0.1:${port}`,BOT_MODE:'webhook',BOT_PORT:String(bp),BOT_STATE_DIR:dir,BOT_CLINIC_USERS_FILE:roster,BOT_WEBHOOK_SECRET:'',PLANFIX_WEBHOOK_URL:`http://127.0.0.1:${port}/pf`,PLANFIX_API_TOKEN:'',YOUTRACK_TOKEN:'',BOT_ENGINEER_CODE:''},stdio:['ignore','pipe','pipe']});bot.stdout.on('data',x=>logs+=x);bot.stderr.on('data',x=>logs+=x);
 for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${bp}/health`);if(r.ok)return;}catch{}await sleep(50);}throw Error(logs);
}
async function stop(){if(bot.exitCode!==null)return;const p=new Promise(r=>bot.once('exit',r));bot.kill();await p;}
const user=123;
const msg=(text,attachments=[])=>({update_type:'message_created',message:{sender:{user_id:user,name:'Тест'},recipient:{chat_id:777,user_id:user},body:{mid:Math.random().toString(),text,attachments}}});
const cb=payload=>({update_type:'message_callback',callback:{callback_id:'test',payload,user:{user_id:user,name:'Тест'}},message:{recipient:{chat_id:777,user_id:user},body:{}}});
async function post(u){sent=[];const r=await fetch(`http://127.0.0.1:${bp}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)});assert.equal(r.status,200);for(let i=0;i<60&&!sent.length;i++)await sleep(20);await sleep(80);}
try{
 await launch();await post(msg('заявка'));assert(JSON.stringify(sent).includes('request_contact'));
 await post(msg('+79001112233'));assert(JSON.stringify(sent).includes('request_contact'));
 await post(cb('clinic:manual'));await post(cb('c:kind:0'));assert(!JSON.stringify(sent).includes('ДОКТОР МИРА'));
 await post(cb('c:clinic:9'));assert(!sent.some(x=>/В каком модуле/.test(x.text)));
 const vcf='BEGIN:VCARD\r\nVERSION:3.0\r\nTEL;TYPE=cell:79001112233\r\nEND:VCARD\r\n';
 const contact={type:'contact',payload:{vcf_info:vcf,hash:createHmac('sha256','fixture-token').update(vcf).digest('hex'),max_info:{user_id:user}}};
 await post(msg('',[{...contact,payload:{...contact.payload,hash:'bad'}}]));assert(sent.some(x=>/Не удалось подтвердить/.test(x.text)));
 await post(msg('',[contact]));assert(sent.some(x=>/ДОКТОР МИРА/.test(x.text)));
 await post(cb('c:kind:0'));assert(sent.some(x=>/В каком модуле/.test(x.text)));assert(!sent.some(x=>/Из какой вы клиники/.test(x.text)));
 await stop();await launch();await post(cb('nav:cancel'));await post(msg('заявка'));assert(!JSON.stringify(sent).includes('request_contact'));
 await post(cb('c:kind:0'));assert(sent.some(x=>/В каком модуле/.test(x.text)));
 await post(cb('c:module:0'));await post(cb('c:role:0'));
 await post(msg('Тестовый врач / логин 123'));await post(cb('skip'));
 await post(msg('Тестовая ошибка'));await post(msg('Открыть карту и нажать кнопку'));
 await post(msg('Ошибка'));await post(msg('Открывается карта'));
 await post(cb('c:urgency:1'));
 assert(sent.some(x=>/Приложите/.test(x.text)));
 assert(!sent.some(x=>/Как с вами связаться/.test(x.text)));
 await post(cb('files:done'));
 assert(sent.some(x=>x.text.includes('Контакт: Телефон: +79001112233 · MAX: Тест (ID: 123)')));
 assert(!logs.includes('79001112233'));
 console.log('Вебхук: контакт, подпись, ограничения клиники, автоматический выбор, перезапуск — OK');
}finally{await stop();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
