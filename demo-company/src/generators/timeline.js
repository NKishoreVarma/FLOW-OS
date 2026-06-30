import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const TL_TYPES=[
  {type:'PRODUCT_LAUNCH',relatedType:'product'},
  {type:'INCIDENT',relatedType:'incident'},
  {type:'HIRE',relatedType:'employee'},
  {type:'CUSTOMER_WON',relatedType:'customer'},
  {type:'DECISION',relatedType:'document'},
  {type:'SPRINT_COMPLETED',relatedType:'jira'},
  {type:'SECURITY_REVIEW',relatedType:'document'},
  {type:'ALL_HANDS',relatedType:'meeting'},
];
const TITLES={PRODUCT_LAUNCH:(p)=>`${p} new version released`,INCIDENT:()=>`Production incident detected and resolved`,HIRE:()=>'New employee onboarded',CUSTOMER_WON:(p,c)=>`New customer: ${c}`,DECISION:()=>'Architecture decision recorded',SPRINT_COMPLETED:()=>`Sprint completed`,SECURITY_REVIEW:()=>'Security audit completed',ALL_HANDS:()=>'Company all-hands held'};

export function generateTimeline(employees,customers,incidents,jiraIssues,calendarEvents,documents) {
  return Array.from({length:500},(_,idx)=>{
    const i=idx+1;
    const tmpl=faker.helpers.arrayElement(TL_TYPES);
    const product=faker.helpers.arrayElement(PRODUCTS);
    const customer=faker.helpers.arrayElement(customers);
    const incident=faker.helpers.arrayElement(incidents);
    const relatedId=tmpl.relatedType==='incident'?incident.id:tmpl.relatedType==='customer'?customer.id:tmpl.relatedType==='product'?product.id:tmpl.relatedType==='employee'?faker.helpers.arrayElement(employees).id:tmpl.relatedType==='jira'?faker.helpers.arrayElement(jiraIssues).id:tmpl.relatedType==='meeting'?faker.helpers.arrayElement(calendarEvents).id:faker.helpers.arrayElement(documents).id;
    return {
      id:`tl-${String(i).padStart(3,'0')}`,
      type:tmpl.type,
      title:TITLES[tmpl.type](product.name,customer.name),
      description:faker.lorem.sentence(),
      timestamp:faker.date.between({from:'2025-01-01',to:'2025-12-31'}).toISOString(),
      actors:[faker.helpers.arrayElement(employees).id],
      relatedId,relatedType:tmpl.relatedType,
      productId:product.id,
    };
  }).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
