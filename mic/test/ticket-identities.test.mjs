import assert from 'node:assert/strict';
import {updateTicketIdentity} from '../bot/ticket-identities.mjs';
const t={taskId:17033,userId:123,ytId:'stable',ticketNo:'MIC-22',ytKey:'MIC-22',ytSince:100,lastCommentId:200};
assert(updateTicketIdentity(t,{id:'stable',key:'SupportDocWorld-2',project:'SupportDocWorld',clinic:'ДОКТОР МИРА'}));
assert.equal(t.ticketNo,'SupportDocWorld-2');assert.deepEqual(t.ytAliases,['MIC-22']);assert.equal(t.userId,123);assert.equal(t.taskId,17033);assert.equal(t.ytSince,100);assert.equal(t.lastCommentId,200);assert.equal(t.ytId,'stable');assert.equal(t.clinic,'ДОКТОР МИРА');
assert(!updateTicketIdentity(t,{key:'SupportDocWorld-2',project:'SupportDocWorld',clinic:'ДОКТОР МИРА'}));
console.log('Перенос: новый номер и прежние id, отправитель и отметки переписки — OK');
