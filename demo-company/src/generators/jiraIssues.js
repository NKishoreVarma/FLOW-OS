import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const STORY_TITLES = ['Implement SSO with SAML 2.0','Add dark mode support','Optimize dashboard load time','Add export to CSV','Implement webhook notifications','Add custom field support','Build audit log viewer','Add two-factor auth','Build advanced search','Implement data retention policies'];
const BUG_TITLES = ['Dashboard fails for accounts with 1000+ records','Auth token not refreshing','Export fails for large datasets','Slow query on analytics page','Memory leak in background worker','CORS error on API','Date formatting wrong in EU locale','PDF export missing columns','Search not paginating','Webhook retries not triggering'];
const SPRINTS = Array.from({length:12},(_,i)=>`Sprint ${i+1} — 2025`);
const TYPES = [{weight:0.4,value:'story'},{weight:0.35,value:'bug'},{weight:0.15,value:'task'},{weight:0.1,value:'epic'}];
const STATUSES = [{weight:0.45,value:'done'},{weight:0.25,value:'in-progress'},{weight:0.2,value:'todo'},{weight:0.1,value:'backlog'}];
const PRIORITIES = [{weight:0.05,value:'critical'},{weight:0.25,value:'high'},{weight:0.45,value:'medium'},{weight:0.25,value:'low'}];

export function generateJiraIssues(engineers, customers) {
  const issues = [];
  for (const product of PRODUCTS) {
    for (let i = 1; i <= 300; i++) {
      const type = faker.helpers.weightedArrayElement(TYPES);
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const createdAt = faker.date.between({from:'2025-01-01',to:'2025-12-01'}).toISOString();
      issues.push({
        id: `${product.jiraKey}-${i}`,
        projectKey: product.jiraKey,
        title: type==='bug' ? faker.helpers.arrayElement(BUG_TITLES) : faker.helpers.arrayElement(STORY_TITLES),
        description: faker.lorem.paragraph(),
        type, status,
        priority: faker.helpers.weightedArrayElement(PRIORITIES),
        assignee: faker.helpers.arrayElement(engineers).id,
        reporter: faker.helpers.arrayElement(engineers).id,
        sprint: faker.helpers.arrayElement(SPRINTS),
        storyPoints: faker.helpers.arrayElement([1,2,3,5,8,13]),
        labels: faker.helpers.arrayElements(['backend','frontend','performance','security','ux','api','infra'], faker.number.int({min:0,max:3})),
        customerId: Math.random()<0.2 && customers.length ? faker.helpers.arrayElement(customers).id : null,
        epicId: type!=='epic' && i>10 && Math.random()<0.3 ? `${product.jiraKey}-${faker.number.int({min:1,max:10})}` : null,
        createdAt,
        resolvedAt: status==='done' ? faker.date.between({from:createdAt,to:'2025-12-31'}).toISOString() : null,
      });
    }
  }
  return issues;
}
