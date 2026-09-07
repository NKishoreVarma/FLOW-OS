import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const TITLES=['Platform API returning 502 errors for all enterprise customers','Analytics data pipeline stalled','Auth service timeout — users unable to log in','Connect adapter outage — webhooks failing','Database replication lag exceeding 60 seconds','Memory leak in Platform worker','DDoS-like traffic spike on API gateway','SSL certificate expiration on Connect endpoints','Data loss incident in analytics stream','Guard policy engine returning incorrect decisions'];
const ROOT_CAUSES=['Misconfigured load balancer after routine deployment','Unindexed query causing full table scan','Memory allocation bug in v2.14.0','Third-party dependency rate limit exceeded','Infrastructure autoscaling misconfigured','Network partition between AZs','Certificate not rotated before expiration'];
const SEVER=[{weight:0.05,value:'P0'},{weight:0.2,value:'P1'},{weight:0.4,value:'P2'},{weight:0.35,value:'P3'}];
const STS=[{weight:0.75,value:'resolved'},{weight:0.15,value:'mitigated'},{weight:0.1,value:'investigating'}];

export function generateIncidents(employees, customers) {
  const srTeam=employees.filter(e=>e.department==='dept-devops'||e.department.startsWith('dept-eng'));
  return Array.from({length:80},(_,idx)=>{
    const i=idx+1;
    const severity=faker.helpers.weightedArrayElement(SEVER);
    const status=faker.helpers.weightedArrayElement(STS);
    const product=faker.helpers.arrayElement(PRODUCTS);
    const detectedAt=faker.date.between({from:'2025-01-01',to:'2025-11-01'}).toISOString();
    const mttr=severity==='P0'?faker.number.int({min:30,max:240}):severity==='P1'?faker.number.int({min:15,max:90}):faker.number.int({min:5,max:45});
    const resolvedAt=status==='resolved'?new Date(new Date(detectedAt).getTime()+mttr*60000).toISOString():null;
    const commander=faker.helpers.arrayElement(srTeam);
    const affectedCustomers=faker.helpers.arrayElements(customers,faker.number.int({min:severity==='P0'?10:0,max:severity==='P0'?50:5})).map(c=>c.id);
    return {
      id:`inc-${String(i).padStart(3,'0')}`,
      title:faker.helpers.arrayElement(TITLES),
      description:faker.lorem.paragraph(),
      severity,status,
      affectedProduct:product.id,
      affectedCustomers,commander:commander.id,
      timeline:[
        {timestamp:detectedAt,action:'Incident detected via monitoring',actor:commander.id},
        {timestamp:new Date(new Date(detectedAt).getTime()+300000).toISOString(),action:'Incident channel created, team paged',actor:commander.id},
        {timestamp:new Date(new Date(detectedAt).getTime()+900000).toISOString(),action:'Root cause identified',actor:faker.helpers.arrayElement(srTeam).id},
        ...(resolvedAt?[{timestamp:resolvedAt,action:'Service fully restored',actor:commander.id}]:[]),
      ],
      rootCause:faker.helpers.arrayElement(ROOT_CAUSES),
      resolution:`Applied hotfix. Deployed v${faker.system.semver()}. Monitoring confirmed.`,
      detectedAt,resolvedAt,mttr:resolvedAt?mttr:null,
    };
  });
}
