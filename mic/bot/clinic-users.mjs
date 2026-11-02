// Частный реестр клиник. Телефоны не попадают в Git и логи; подтверждённый
// телефон используется как контакт заявителя в его задаче.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CLINICS } from '../ticket.mjs';
export function normalizePhone(value) {
 let n=String(value||'').replace(/\D/g,'');
 if(n.length===11&&n[0]==='8')n='7'+n.slice(1);
 if(n.length===10)n='7'+n;
 return /^7\d{10}$/.test(n)?n:null;
}
const digest=phone=>createHash('sha256').update(phone).digest('hex');
// https://dev.max.ru/docs-api/use-cases/sending-messages/keyboard/
export function verifiedPhone(update,token) {
 const msg=update?.message;
 if(!token||!msg?.sender?.user_id||msg.link?.type==='forward')return null;
 for(const a of msg.body?.attachments||[]) {
  if(a.type!=='contact')continue;
  const p=a.payload||{},vcf=p.vcf_info;
  if(typeof vcf!=='string'||typeof p.hash!=='string')continue;
  if(p.max_info?.user_id!=null&&String(p.max_info.user_id)!==String(msg.sender.user_id))continue;
  const variants=[vcf,vcf.replace(/\\r\\n/g,'\r\n')];
  const signed=variants.some(v=>{
   const expected=createHmac('sha256',token).update(v).digest();
   const actual=/^[a-f\d]{64}$/i.test(p.hash)?Buffer.from(p.hash,'hex'):Buffer.from(p.hash,'base64');
   return actual.length===expected.length&&timingSafeEqual(actual,expected);
  });
  if(!signed)continue;
  const numbers=[...vcf.replace(/\\r\\n/g,'\r\n').replace(/\r\n[ \t]/g,'').matchAll(/^TEL[^:\r\n]*:(?:tel:)?([^\r\n]+)/gim)].map(m=>normalizePhone(m[1])).filter(Boolean);
  if(new Set(numbers).size===1)return numbers[0];
 }
 return null;
}
export class ClinicUsers {
 constructor(rosterFile,stateFile,token){Object.assign(this,{rosterFile,stateFile,token});this.rows=new Map();this.bindings={};this.enabled=false;this.writes=Promise.resolve();}
 async load(){
  if(!this.rosterFile)return;
  const list=JSON.parse(await readFile(this.rosterFile,'utf8'));
  if(!Array.isArray(list)||!list.length)throw Error('Пустой реестр пользователей клиник');
  this.rows.clear();
  for(const r of list){
   const phone=normalizePhone(r.phone);
   if(!phone||!CLINICS.includes(r.clinic))throw Error('Некорректная запись в реестре клиник');
   const key=digest(phone),old=this.rows.get(key);
   if(old&&old.clinic!==r.clinic)throw Error('Один телефон привязан к разным клиникам');
   this.rows.set(key,{clinic:r.clinic,name:r.name||'',phone});
  }
  try{this.bindings=JSON.parse(await readFile(this.stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  this.enabled=true;
 }
 byUserId(id){const key=this.bindings[id]?.phoneHash;return key?this.rows.get(key)||null:null;}
 manualClinics(){const covered=new Set([...this.rows.values()].map(r=>r.clinic));return CLINICS.filter(c=>!covered.has(c));}
 async identify(update){
  const phone=verifiedPhone(update,this.token);if(!phone)return {error:'unverified'};
  const key=digest(phone),row=this.rows.get(key);if(!row)return {error:'unknown'};
  const userId=update.message.sender.user_id;
  if(Object.entries(this.bindings).some(([id,b])=>String(id)!==String(userId)&&b.phoneHash===key))return {error:'bound'};
  this.bindings[userId]={phoneHash:key,verifiedAt:Date.now()};
  this.writes=this.writes.catch(()=>{}).then(async()=>{await mkdir(dirname(this.stateFile),{recursive:true});const tmp=this.stateFile+'.tmp';await writeFile(tmp,JSON.stringify(this.bindings),{mode:0o600});await rename(tmp,this.stateFile);});
  await this.writes;return row;
 }
}
