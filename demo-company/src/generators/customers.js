import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const INDUSTRIES = ['Financial Services', 'Healthcare', 'Retail', 'Manufacturing', 'Technology', 'Logistics', 'Education', 'Media', 'Government', 'Energy'];
const TIERS = [{weight:0.2,value:'enterprise'},{weight:0.4,value:'mid-market'},{weight:0.4,value:'smb'}];
const HEALTH = [{weight:0.65,value:'healthy'},{weight:0.25,value:'at-risk'},{weight:0.1,value:'churned'}];

export function generateCustomers(employees) {
  const csms = employees.filter(e => e.department === 'dept-customer-success');
  return Array.from({ length: 210 }, (_, idx) => {
    const i = idx + 1;
    const companyName = faker.company.name();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g,'').slice(0,30) + `-${i}`;
    const tier = faker.helpers.weightedArrayElement(TIERS);
    const arrByTier = { enterprise: faker.number.int({min:100000,max:500000}), 'mid-market': faker.number.int({min:24000,max:100000}), smb: faker.number.int({min:6000,max:24000}) };
    const selectedProducts = faker.helpers.arrayElements(PRODUCTS, faker.number.int({min:1,max:PRODUCTS.length})).map(p => p.id);
    const numContacts = faker.number.int({min:1,max:3});
    return {
      id: `cust-${slug}`,
      name: companyName, slug,
      industry: faker.helpers.arrayElement(INDUSTRIES),
      tier, arr: arrByTier[tier],
      csm: faker.helpers.arrayElement(csms).id,
      health: faker.helpers.weightedArrayElement(HEALTH),
      contacts: Array.from({length:numContacts}, () => ({
        name: faker.person.fullName(),
        email: faker.internet.email({provider: slug.replace(/-\d+$/,'')+'.com'}),
        role: faker.helpers.arrayElement(['CTO','VP Engineering','Director of IT','Head of Operations','CEO']),
      })),
      products: selectedProducts,
    };
  });
}
