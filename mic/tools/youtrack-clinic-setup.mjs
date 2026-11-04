// Настройка уже созданных проектов клиник. По умолчанию только план, запись — --apply.
// Никаких новых проектов и глобальных ролей не создаёт.
import {CLINIC_PROJECT, CLINIC_ENGINEER, ENGINEER_LOGINS, URGENCIES} from '../ticket.mjs';
const base=(process.env.YOUTRACK_URL||'').replace(/\/+$/,''),token=process.env.YOUTRACK_TOKEN;
if(!base||!token)throw Error('Нужны YOUTRACK_URL и YOUTRACK_TOKEN');
const apply=process.argv.includes('--apply');
async function call(method,path,body){
 const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 if(!r.ok)throw Error(`${method} ${path.split('?')[0]}: ${r.status} ${(data?.error_description||'').slice(0,160)}`);
 return data;
}
const projects=await call('GET','/api/admin/projects?fields=id,shortName,name,team(id)&$top=500');
const hubs=(await call('GET','/hub/api/rest/projects?fields=id,key,team(id)&$top=500')).projects;
const users=await call('GET','/api/users?fields=id,login,ringId&$top=2000');
const template=projects.find(p=>p.shortName==='SupportUnimed');
if(!template)throw Error('Нет проекта-образца SupportUnimed');
const tf=await call('GET',`/api/admin/projects/${template.id}/customFields?fields=$type,field(id,name),bundle(id,$type),canBeEmpty&$top=100`);
const required=['Тип заявки','Модуль','Роль','Пациент','Контакт заявителя','Источник','Разработчик'];
for(const [clinic,key] of Object.entries(CLINIC_PROJECT)){
 const p=projects.find(p=>p.shortName===key),hub=hubs.find(p=>p.key===key);
 if(!p||!hub?.team?.id)throw Error(`Проект ${key} недоступен`);
 const login=ENGINEER_LOGINS[CLINIC_ENGINEER[clinic]],user=users.find(u=>u.login===login);
 if(!user?.ringId)throw Error(`Не найден Hub id пользователя ${login}`);
 const team=await call('GET',`/api/groups/${p.team.id}/users?fields=login&$top=1000`);
 if(!team.some(u=>u.login===login)){
  console.log(`${key}: добавить ${login} в команду`);
  if(apply)await call('POST',`/hub/api/rest/projectteams/${hub.team.id}/users`,{id:user.ringId});
 }
 const fields=await call('GET',`/api/admin/projects/${p.id}/customFields?fields=id,$type,field(id,name),bundle(id,$type)&$top=100`);
 for(const name of required){
  if(fields.some(f=>f.field.name===name))continue;
  console.log(`${key}: добавить поле «${name}»`);
  if(!apply)continue;
  const source=tf.find(f=>f.field.name===name);if(!source)throw Error(`В образце нет поля ${name}`);
  let bundle=source.bundle;
  if(name==='Разработчик'){
   const list=await call('GET','/api/admin/customFieldSettings/bundles/user?fields=id,name&$top=1000');
   bundle=list.find(b=>b.name===`${key}: Разработчик`);
   if(!bundle)bundle=await call('POST','/api/admin/customFieldSettings/bundles/user?fields=id',{$type:'UserBundle',name:`${key}: Разработчик`,groups:[{id:p.team.id}]});
   bundle={id:bundle.id,$type:'UserBundle'};
  }
  await call('POST',`/api/admin/projects/${p.id}/customFields?fields=id`,{$type:source.$type,field:{id:source.field.id,$type:'CustomField'},canBeEmpty:true,...(bundle?{bundle}:{} )});
 }
 const urgency=fields.find(f=>f.field.name==='Срочность');
 if(urgency?.bundle){
  const values=await call('GET',`/api/admin/customFieldSettings/bundles/enum/${urgency.bundle.id}/values?fields=name&$top=500`);
  for(const name of URGENCIES)if(!values.some(v=>v.name===name)){
   console.log(`${key}: добавить срочность «${name}»`);
   if(apply)await call('POST',`/api/admin/customFieldSettings/bundles/enum/${urgency.bundle.id}/values`,{name,$type:'EnumBundleElement'});
  }
 }
}
console.log(apply?'Проекты клиник настроены':'План готов. Для применения: --apply');
