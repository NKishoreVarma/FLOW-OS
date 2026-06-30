import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const DOC_TYPES=[{weight:0.2,value:'runbook'},{weight:0.15,value:'architecture'},{weight:0.15,value:'api-spec'},{weight:0.15,value:'post-mortem'},{weight:0.1,value:'rfc'},{weight:0.15,value:'onboarding'},{weight:0.1,value:'policy'}];
const TITLES={
  runbook:['On-Call Runbook: Platform API','Database Failover Runbook','Deployment Rollback Procedure','Incident Response Playbook','SSL Certificate Renewal SOP'],
  architecture:['Platform Microservices Architecture','Data Pipeline Architecture','Multi-Region Deployment Strategy','Event-Driven Messaging Design','Security Architecture Overview'],
  'api-spec':['Platform API v3 Reference','Connect Adapter Interface Spec','Analytics Query API','Authentication API Reference','Guard Policy API'],
  'post-mortem':['Post-Mortem: P0 Database Outage','Post-Mortem: Auth Service Failure','Post-Mortem: Data Pipeline Stall','Blameless Post-Mortem: API Gateway Issue'],
  rfc:['RFC: Adopt GraphQL for Platform API','RFC: Event sourcing for audit log','RFC: Migrate to Kubernetes','RFC: Adopt OpenTelemetry'],
  onboarding:['Engineering Onboarding Guide','Sales Onboarding Playbook','Customer Success Onboarding','Executive Briefing: Helios Platform'],
  policy:['Data Retention Policy','Security Incident Response Policy','Remote Work Policy','Code Review Standards','Release Management Policy'],
};

export function generateDocuments(employees) {
  return Array.from({length:400},(_,idx)=>{
    const i=idx+1;
    const type=faker.helpers.weightedArrayElement(DOC_TYPES);
    const ts=TITLES[type]||['Internal Document'];
    const product=Math.random()<0.7?faker.helpers.arrayElement(PRODUCTS):null;
    const author=faker.helpers.arrayElement(employees);
    const createdAt=faker.date.between({from:'2024-06-01',to:'2025-06-01'}).toISOString();
    return {
      id:`doc-${String(i).padStart(3,'0')}`,
      title:faker.helpers.arrayElement(ts)+(i>ts.length?` v${faker.number.int({min:2,max:5})}`:' ').trimEnd(),
      content:faker.lorem.paragraphs(faker.number.int({min:3,max:8})),
      type,productId:product?.id||null,author:author.id,
      tags:faker.helpers.arrayElements(['engineering','product','operations','security','onboarding','release'],faker.number.int({min:1,max:3})),
      createdAt,
      updatedAt:faker.date.between({from:createdAt,to:'2025-12-31'}).toISOString(),
    };
  });
}
