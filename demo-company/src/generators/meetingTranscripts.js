import faker from '../faker.js';

const HIGH_VALUE = ['sprint-review','executive','customer','incident-review','all-hands'];

export function generateMeetingTranscripts(calendarEvents, employees) {
  const hi=calendarEvents.filter(e=>HIGH_VALUE.includes(e.type));
  const lo=calendarEvents.filter(e=>!HIGH_VALUE.includes(e.type));
  const selected=[...hi,...faker.helpers.arrayElements(lo,Math.max(0,150-hi.length))].slice(0,150);
  return selected.map(event=>{
    const parts=event.attendees.slice(0,4);
    const decisions=Array.from({length:faker.number.int({min:1,max:4})},()=>faker.helpers.arrayElement(['Approved migration to microservices','Agreed to delay release for quality','Escalated customer issue to exec','Approved headcount request','Adopted event-driven messaging','Greenlit feature for next roadmap']));
    const actionItems=Array.from({length:faker.number.int({min:1,max:5})},()=>({
      owner:faker.helpers.arrayElement(employees).id,
      text:faker.helpers.arrayElement(['Update runbook with new procedure','Schedule follow-up with customer','Create Jira epic for sprint','Draft architecture RFC','Share post-mortem with leadership','Prepare metrics dashboard']),
      dueDate:faker.date.soon({days:14}).toISOString().split('T')[0],
    }));
    const lines=parts.flatMap(pId=>{
      const emp=employees.find(e=>e.id===pId);
      return Array.from({length:faker.number.int({min:3,max:8})},()=>`${emp?.name||'Participant'}: ${faker.lorem.sentence()}`);
    }).sort(()=>Math.random()-0.5);
    return {
      id:`transcript-${event.id}`,eventId:event.id,
      content:lines.join('\n'),participants:parts,
      summary:faker.lorem.paragraph(),decisions,actionItems,
    };
  });
}
