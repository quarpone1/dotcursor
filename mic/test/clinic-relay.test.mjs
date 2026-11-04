import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {CLINIC_PROJECT,CLINICS} from '../ticket.mjs';
const dir=await mkdtemp(join(tmpdir(),'mic-route-relay-')),sent=[],comments=[],pfCreated=[],issues=[];
let logs='',bot;
const now=Date.now(),projects=Object.values(CLINIC_PROJECT).map((key,i)=>({id:`p${i}`,shortName:key,name:key}));
await writeFile(join(dir,'bot-tickets.json'),JSON.stringify([{taskId:17999,userId:7001,chatId:7001,ytId:'stable',ytKey:'MIC-23',ticketNo:'MIC-23',createdAt:now,lastActivity:now,ytSince:now-10000}]));
const fields=['Объект','Где выявлено','Type','Priority','Тип заявки','Срочность','Разработчик','Модуль','Роль','Контакт заявителя','Источник'];
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};
 const send=data=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(u.pathname==='/messages'){sent.push(b);return send({message:{}});}
 if(u.pathname==='/api/admin/projects')return send(projects);
 if(/^\/api\/admin\/projects\/p\d+\/customFields$/.test(u.pathname))return send(fields.map(name=>({field:{name},$type:'SimpleProjectCustomField'})));
 if(u.pathname==='/api/issues/stable')return send({id:'stable',idReadable:'SupportDocWorld-2',project:{shortName:'SupportDocWorld'}});
 if(u.pathname==='/api/issues'&&req.method==='GET')return send([{id:'stable',idReadable:'SupportDocWorld-2',project:{shortName:'SupportDocWorld'}}]);
 if(u.pathname==='/api/issues'&&req.method==='POST'){issues.push(b);return send({id:'new-id',idReadable:'SupportNeftUrengoy-1'});}
 if(u.pathname==='/api/issues/stable/comments'&&req.method==='GET')return send([{id:'reply1',text:'Ответ после переноса',created:now,author:{login:'shcherbakov_eg',fullName:'Эдуард'}}]);
 if(u.pathname==='/api/issues/stable/comments'&&req.method==='POST'){comments.push(b);return send({id:'cnew'});}
 if(/\/comments$/.test(u.pathname))return send([]);
 if(u.pathname==='/contact/list')return send({contacts:[{id:971,name:'Тест',lastname:'',isCompany:false}]});
 if(u.pathname==='/task/'){pfCreated.push(b);return send({id:18001});}
 if(u.pathname==='/task/list')return send({tasks:[]});
 if(/\/comments\/$/.test(u.pathname))return send({id:123});
 if(u.pathname==='/customfield/task')return send({customfields:[]});
 return send({});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const bp=probe.address().port;await new Promise(r=>probe.close(r));
const msg=(user,text)=>({update_type:'message_created',message:{sender:{user_id:user,name:'Тест'},recipient:{chat_id:user,user_id:user},body:{mid:Math.random().toString(),text,attachments:[]}}});
const cb=(user,payload)=>({update_type:'message_callback',callback:{callback_id:'cb',payload,user:{user_id:user,name:'Тест'}},message:{recipient:{chat_id:user,user_id:user},body:{}}});
async function post(u){const r=await fetch(`http://127.0.0.1:${bp}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(u)});assert.equal(r.status,200);await sleep(100);}
try{
 bot=spawn(process.execPath,['bot/bot.mjs'],{env:{...process.env,BOT_STATE_DIR:dir,BOT_CLINIC_USERS_FILE:'',BOT_MODE:'webhook',BOT_PORT:String(bp),BOT_WEBHOOK_SECRET:'',MAX_BOT_TOKEN:'test',MAX_API_BASE:`http://127.0.0.1:${port}`,PLANFIX_API_TOKEN:'test',PLANFIX_API_BASE:`http://127.0.0.1:${port}`,PLANFIX_WEBHOOK_URL:`http://127.0.0.1:${port}/pf`,PLANFIX_MIN_GAP_MS:'0',PLANFIX_RELAY_MIN_SECONDS:'1',PLANFIX_RELAY_SECONDS:'1',YOUTRACK_URL:`http://127.0.0.1:${port}`,YOUTRACK_TOKEN:'test',YOUTRACK_ROUTING:'clinics',YOUTRACK_MIN_GAP_MS:'0'},stdio:['ignore','pipe','pipe']});bot.stdout.on('data',b=>logs+=b);bot.stderr.on('data',b=>logs+=b);
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${bp}/health`)).ok)break;}catch{}await sleep(50);}
 const saved=JSON.parse(await readFile(join(dir,'bot-tickets.json'),'utf8'))[0];assert.equal(saved.ticketNo,'SupportDocWorld-2');assert.equal(saved.userId,7001);assert.equal(saved.ytSince,now-10000);
 await sleep(1200);assert(sent.some(m=>m.text.includes('Ответ по заявке SupportDocWorld-2')&&m.text.includes('Ответ после переноса')));
 await post(cb(7001,'reply:17999'));await post(msg(7001,'Ответ клиента после переноса'));assert(comments.some(c=>c.text.includes('Ответ клиента после переноса')));
 await post(msg(7002,'заявка'));await post(cb(7002,'c:kind:1'));await post(cb(7002,`c:clinic:${CLINICS.indexOf('Нефтяник Нов.Уренгой')}`));await post(cb(7002,'c:module:0'));await post(cb(7002,'c:role:0'));await post(msg(7002,'Тестовый пользователь'));await post(msg(7002,'Новая доработка для Уренгоя'));await post(msg(7002,'Добавить кнопку печати документа'));await post(msg(7002,'Нужно ускорить оформление'));await post(cb(7002,'c:urgency:2'));await post(cb(7002,'files:done'));await post(cb(7002,'ok:send'));await sleep(200);
 assert.equal(issues.length,1);assert.equal(issues[0].project.id,projects.find(p=>p.shortName==='SupportNeftUrengoy').id);
 assert(pfCreated[0].name.startsWith('[SupportNeftUrengoy-1]'));assert(sent.some(m=>m.text.includes('Заявка SupportNeftUrengoy-1 принята')));
 console.log('Сквозная проверка: перенос → ответы в обе стороны; новая заявка → проект клиники и Planfix — OK');
}finally{if(bot&&bot.exitCode===null){const done=new Promise(r=>bot.once('exit',r));bot.kill();await done;}await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
