import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {CLINIC_PROJECT,CLINIC_ENGINEER,ENGINEER_LOGINS,CLINIC_OBJECT} from '../ticket.mjs';
let missing=true;const bodies=[],months=[],queries=[];
const projects=Object.values(CLINIC_PROJECT).map((key,i)=>({id:`59-${i}`,shortName:key,name:key,team:{id:`team-${i}`}}));
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):null;
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(u.pathname==='/api/admin/projects')return send(200,missing?projects.filter(p=>p.shortName!=='SupportGP17'):projects);
 if(u.pathname==='/api/groups')return send(200,[]);
 const pf=/^\/api\/admin\/projects\/(59-\d+)\/customFields$/.exec(u.pathname);
 if(pf){const i=projects.findIndex(p=>p.id===pf[1]);return send(200,[
 {$type:'EnumProjectCustomField',field:{name:'Объект'},bundle:{id:`obj-${i}`}},
 {$type:'EnumProjectCustomField',field:{name:'Где выявлено'},bundle:{id:`obj-${i}`}},
 {$type:'VersionProjectCustomField',field:{name:'Месяц создания'},bundle:{id:`mon-${i}`}},
 ...['Type','Priority','Тип заявки','Срочность','Разработчик','Модуль','Роль','Пациент','Контакт заявителя','Источник'].map(name=>({field:{name},$type:'SimpleProjectCustomField'}))]);}
 const ob=/\/bundles\/enum\/obj-(\d+)\/values$/.exec(u.pathname);
 if(ob)return send(200,[{name:CLINIC_OBJECT[Object.keys(CLINIC_PROJECT)[Number(ob[1])]]}]);
 const mb=/\/bundles\/version\/(mon-\d+)\/values$/.exec(u.pathname);
 if(mb){if(req.method==='POST'){months.push([mb[1],b.name]);return send(200,{id:'v',name:b.name});}return send(200,[{name:'2026.11'}]);}
 if(u.pathname==='/api/issues'&&req.method==='POST'){bodies.push(b);return send(200,{id:`i-${bodies.length}`,idReadable:`${projects.find(p=>p.id===b.project.id).shortName}-${bodies.length}`});}
 if(u.pathname==='/api/issues'){queries.push(u.searchParams.get('query'));return send(200,[{id:'old-id',idReadable:'SupportDocWorld-2',project:{shortName:'SupportDocWorld'}}]);}
 if(u.pathname==='/api/issues/old-id')return send(200,{id:'old-id',idReadable:'SupportDocWorld-2',project:{shortName:'SupportDocWorld'}});
 return send(404,{});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.YOUTRACK_URL=`http://127.0.0.1:${server.address().port}`;process.env.YOUTRACK_TOKEN='test';process.env.YOUTRACK_ROUTING='clinics';process.env.YOUTRACK_MIN_GAP_MS='0';
const yt=await import('../bot/youtrack.mjs');
assert.equal(yt.ytDateTime(Date.UTC(2026,10,4,12,0)),'2026-11-04T17:00');
assert.equal(yt.monthOf(Date.UTC(2026,9,31,22,0)),'2026.11');
try{
 await assert.rejects(()=>yt.loadProject(),/SupportGP17/);missing=false;await yt.loadProject();
 for(const [clinic,key] of Object.entries(CLINIC_PROJECT)){
  const issue=await yt.createIssue({summary:'Тест',description:'Тест',fields:{clinic,kind:'Ошибка',contact:'MAX: тест'},createdAt:Date.UTC(2026,10,4)});
  const b=bodies.at(-1),cf=Object.fromEntries(b.customFields.map(f=>[f.name,f.value]));
  assert.equal(b.project.id,projects.find(p=>p.shortName===key).id);assert(issue.key.startsWith(key+'-'));
  assert.equal(cf['Разработчик'].login,ENGINEER_LOGINS[CLINIC_ENGINEER[clinic]]);
  assert.equal(cf['Объект'][0].name,CLINIC_OBJECT[clinic]);assert.equal(cf['Где выявлено'][0].name,CLINIC_OBJECT[clinic]);
  assert.equal(cf['Месяц создания'].name,'2026.11');assert(!('Клиника' in cf));assert(!b.visibility);
 }
 await assert.rejects(()=>yt.createIssue({summary:'x',fields:{clinic:'НЕИЗВЕСТНАЯ'}}),/клиник/);
 const before=bodies.length;await yt.createIssue({summary:'wish',fields:{clinic:'ГП-1',kind:'Доработка'},createdAt:Date.UTC(2027,0,1)});
 const cf=Object.fromEntries(bodies.at(-1).customFields.map(f=>[f.name,f.value]));assert.equal(cf.Type.name,'Task');assert.deepEqual(cf['Где выявлено'],[]);
 assert.equal(months.length,1);assert.equal(months[0][0],`mon-${projects.findIndex(p=>p.shortName==='SupportGP1')}`);
 const changed=await yt.changedIssuesSince(Date.now()-60000);assert(changed.has('old-id'));assert.equal(changed.details.get('old-id').idReadable,'SupportDocWorld-2');
 for(const key of Object.values(CLINIC_PROJECT))assert(queries[0].includes(key));assert(!/project: MIC\b/.test(queries[0]));
 assert.equal((await yt.issueInfo('old-id')).key,'SupportDocWorld-2');
 console.log('Маршрутизация: 14 проектов, свои справочники, исполнитель, месяц, опрос и перенос — OK');
}finally{await new Promise(r=>server.close(r));}
