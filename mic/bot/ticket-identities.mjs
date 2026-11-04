// Перенос в другой проект меняет читаемый номер, но не внутренний id задачи.
export function updateTicketIdentity(ticket, info) {
  if (!info?.key) return false;
  let changed=false;
  if (ticket.ytKey !== info.key || ticket.ticketNo !== info.key) {
    const old=ticket.ytKey || ticket.ticketNo;
    if (old && old !== info.key) ticket.ytAliases=[...new Set([...(ticket.ytAliases || []),old])];
    ticket.ytKey=info.key;
    ticket.ticketNo=info.key;
    changed=true;
  }
  if(info.project && ticket.ytProject!==info.project){ticket.ytProject=info.project;changed=true;}
  if(info.clinic && !ticket.clinic){ticket.clinic=info.clinic;changed=true;}
  return changed;
}
