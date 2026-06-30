import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const TYPES = [{weight:0.3,value:'standup'},{weight:0.15,value:'sprint-review'},{weight:0.2,value:'1on1'},{weight:0.1,value:'executive'},{weight:0.15,value:'customer'},{weight:0.05,value:'incident-review'},{weight:0.05,value:'all-hands'}];
const DURATION = {standup:15,'sprint-review':90,'1on1':30,executive:60,customer:60,'incident-review':60,'all-hands':90};

export function generateCalendarEvents(employees, customers) {
  return Array.from({length:300},(_,idx)=>{
    const i=idx+1;
    const type=faker.helpers.weightedArrayElement(TYPES);
    const product=faker.helpers.arrayElement(PRODUCTS);
    const organizer=faker.helpers.arrayElement(employees);
    const customer=type==='customer'?faker.helpers.arrayElement(customers):null;
    const startTime=faker.date.between({from:'2025-01-01',to:'2025-12-31'}).toISOString();
    const endTime=new Date(new Date(startTime).getTime()+(DURATION[type]||60)*60000).toISOString();
    const attendeeCount=type==='all-hands'?30:faker.number.int({min:2,max:8});
    const attendees=[...new Set([organizer.id,...faker.helpers.arrayElements(employees,attendeeCount).map(e=>e.id)])];
    const title=type==='standup'?`Engineering Daily Standup`:type==='sprint-review'?`${product.name} Sprint Review`:type==='1on1'?`1:1: ${organizer.name} & ${faker.helpers.arrayElement(employees).name}`:type==='executive'?'Executive Leadership Team Sync':type==='customer'?`${customer?.name||'Client'} — QBR`:type==='incident-review'?'Post-Mortem Review':'Helios All-Hands Meeting';
    return {
      id:`cal-${String(i).padStart(3,'0')}`,
      title,description:faker.lorem.sentence(),
      attendees,organizer:organizer.id,
      startTime,endTime,
      location:faker.helpers.arrayElement(['Zoom','Google Meet','Conference Room A',null]),
      type,
      productId:['sprint-review','standup'].includes(type)?product.id:null,
      customerId:customer?.id||null,
      agenda:faker.lorem.sentences(3),
      actionItems:Array.from({length:faker.number.int({min:0,max:5})},()=>faker.lorem.sentence()),
    };
  });
}
