/**
 * Customers generator — scenario customers with fixed IDs prepended.
 * Acme Corp, Meridian Health, GlobalTech have specific story context.
 */
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';
import { CUST, EMP, ACME_SCENARIO } from '../scenarios.js';

const INDUSTRIES = ['Financial Services', 'Healthcare', 'Retail', 'Manufacturing', 'Technology', 'Logistics', 'Education', 'Media', 'Government', 'Energy'];
const TIERS = [{weight:0.2,value:'enterprise'},{weight:0.4,value:'mid-market'},{weight:0.4,value:'smb'}];
const HEALTH_STATUS = [{weight:0.65,value:'healthy'},{weight:0.25,value:'at-risk'},{weight:0.1,value:'churned'}];

// Named scenario customers (fixed IDs, specific story data)
const NAMED_CUSTOMERS = [
  {
    id: CUST.ACME,
    name: 'Acme Corp',
    slug: 'acme-corp',
    industry: 'Technology',
    tier: 'enterprise',
    arr: ACME_SCENARIO.arr,
    healthScore: ACME_SCENARIO.healthScore,
    health: 'at-risk',
    contractRenewalDate: ACME_SCENARIO.contractRenewal,
    contacts: [
      { name: 'Marcus Webb', email: 'marcus.webb@acmecorp.com', role: 'CTO', isPrimary: true },
      { name: 'Lisa Park', email: 'lisa.park@acmecorp.com', role: 'VP Engineering', isPrimary: false },
      { name: 'Tom Chen', email: 'tom.chen@acmecorp.com', role: 'IT Director', isPrimary: false },
    ],
    products: ['prod-platform', 'prod-analytics', 'prod-connect'],
    usageStats: { monthlyActiveUsers: 1247, workflowsRun: 284000, apiCallsPerMonth: 8400000 },
    notes: 'CRITICAL: Contract renewal December 28. Two open P1 tickets (HPLT-892, HPLT-847). 847 failed workflow executions in INC-076 overnight. CTO Marcus Webb escalated via email December 11. CSM: James Wilks (emp-341). High churn risk.',
    openTickets: ['HPLT-892', 'HPLT-847'],
    recentIncidents: ['inc-076', 'inc-042'],
  },
  {
    id: CUST.MERIDIAN,
    name: 'Meridian Health',
    slug: 'meridian-health',
    industry: 'Healthcare',
    tier: 'enterprise',
    arr: 195000,
    healthScore: 67,
    health: 'at-risk',
    contractRenewalDate: '2026-03-15',
    contacts: [
      { name: 'Dr. Rachel Kim', email: 'rachel.kim@meridianhealth.org', role: 'CIO', isPrimary: true },
      { name: 'Amit Patel', email: 'amit.patel@meridianhealth.org', role: 'Director of IT', isPrimary: false },
    ],
    products: ['prod-platform', 'prod-guard'],
    usageStats: { monthlyActiveUsers: 423, workflowsRun: 127000, apiCallsPerMonth: 2100000 },
    notes: 'HIPAA-regulated customer. Requires Guard 2.0 for FedRAMP compliance. 123 failed workflow executions in INC-076. Policy engine bug (HGRD-234) caused incorrect permission decisions — detected by their team first. Health declining since October.',
    openTickets: ['HGRD-234'],
    recentIncidents: ['inc-076', 'inc-042'],
  },
  {
    id: CUST.GLOBALTECH,
    name: 'GlobalTech Solutions',
    slug: 'globaltech-solutions',
    industry: 'Technology',
    tier: 'enterprise',
    arr: 320000,
    healthScore: 71,
    health: 'healthy',
    contractRenewalDate: '2026-05-01',
    contacts: [
      { name: 'Sandra Lee', email: 'sandra.lee@globaltech.io', role: 'VP Engineering', isPrimary: true },
      { name: 'Bob Kumar', email: 'bob.kumar@globaltech.io', role: 'Head of Operations', isPrimary: false },
    ],
    products: ['prod-platform', 'prod-analytics', 'prod-connect', 'prod-guard'],
    usageStats: { monthlyActiveUsers: 2840, workflowsRun: 740000, apiCallsPerMonth: 22000000 },
    notes: '67 failed workflow executions in INC-076. Weekly export (25K rows) affected by HPLT-892 data export bug. Their AE is pushing for Apollo enterprise tier. Strong champion in Sandra Lee.',
    openTickets: ['HPLT-892'],
    recentIncidents: ['inc-076'],
  },
  {
    id: CUST.QUANTUM,
    name: 'QuantumLeap AI',
    slug: 'quantumleap-ai',
    industry: 'Technology',
    tier: 'mid-market',
    arr: 84000,
    healthScore: 88,
    health: 'healthy',
    contractRenewalDate: '2026-08-01',
    contacts: [
      { name: 'Alex Rivera', email: 'alex@quantumleapai.com', role: 'CTO', isPrimary: true },
    ],
    products: ['prod-platform', 'prod-analytics'],
    usageStats: { monthlyActiveUsers: 87, workflowsRun: 34000, apiCallsPerMonth: 890000 },
    notes: 'Fast-growing startup. Using Helios for MLOps pipeline orchestration. Likely expansion to enterprise tier by Q2 2026. Champion: Alex Rivera.',
    openTickets: [],
    recentIncidents: [],
  },
  {
    id: CUST.FINEDGE,
    name: 'FinEdge Capital',
    slug: 'finedge-capital',
    industry: 'Financial Services',
    tier: 'enterprise',
    arr: 410000,
    healthScore: 82,
    health: 'healthy',
    contractRenewalDate: '2026-04-15',
    contacts: [
      { name: 'James Morrison', email: 'james.morrison@finedge.com', role: 'CTO', isPrimary: true },
      { name: 'Priya Rajan', email: 'priya.rajan@finedge.com', role: 'VP Technology', isPrimary: false },
    ],
    products: ['prod-platform', 'prod-guard', 'prod-analytics'],
    usageStats: { monthlyActiveUsers: 678, workflowsRun: 290000, apiCallsPerMonth: 9200000 },
    notes: 'Financial services compliance requirements. Needs SOC 2 Type II and ISO 27001. Strong use case for Guardian 2.0. Potential Apollo prospect.',
    openTickets: [],
    recentIncidents: [],
  },
  {
    id: CUST.NEXIGEN,
    name: 'Nexigen Pharma',
    slug: 'nexigen-pharma',
    industry: 'Healthcare',
    tier: 'enterprise',
    arr: 225000,
    healthScore: 74,
    health: 'healthy',
    contractRenewalDate: '2026-02-28',
    contacts: [
      { name: 'Dr. Maria Santos', email: 'maria.santos@nexigen.com', role: 'CIO', isPrimary: true },
    ],
    products: ['prod-platform', 'prod-guard'],
    usageStats: { monthlyActiveUsers: 312, workflowsRun: 98000, apiCallsPerMonth: 2800000 },
    notes: 'Audit log export bug affecting their compliance reporting (21 CFR Part 11). Renewal in February — need to close the audit timestamp ticket before then.',
    openTickets: ['HGRD-audit-ts'],
    recentIncidents: ['inc-042'],
  },
  {
    id: CUST.PINNACLE,
    name: 'Pinnacle Logistics',
    slug: 'pinnacle-logistics',
    industry: 'Logistics',
    tier: 'mid-market',
    arr: 67000,
    healthScore: 59,
    health: 'at-risk',
    contractRenewalDate: '2025-12-31',
    contacts: [
      { name: 'Greg Williams', email: 'greg.williams@pinnaclelogistics.com', role: 'VP Operations', isPrimary: true },
    ],
    products: ['prod-platform', 'prod-connect'],
    usageStats: { monthlyActiveUsers: 45, workflowsRun: 12000, apiCallsPerMonth: 340000 },
    notes: 'Renewal December 31 — high risk. Low engagement: only 45 MAUs vs 200 licensed seats. Champion left the company in November. No QBR conducted in Q4. CSM needs to schedule call urgently.',
    openTickets: [],
    recentIncidents: ['inc-042'],
  },
  {
    id: CUST.CLOUDNINE,
    name: 'CloudNine Retail',
    slug: 'cloudnine-retail',
    industry: 'Retail',
    tier: 'mid-market',
    arr: 52000,
    healthScore: 91,
    health: 'healthy',
    contractRenewalDate: '2026-06-30',
    contacts: [
      { name: 'Emma Thompson', email: 'emma.thompson@cloudnineretail.com', role: 'Head of Operations', isPrimary: true },
    ],
    products: ['prod-platform', 'prod-connect'],
    usageStats: { monthlyActiveUsers: 134, workflowsRun: 67000, apiCallsPerMonth: 1200000 },
    notes: 'Strong adoption. Excellent NPS (9/10). Expanding to new use case in inventory management. Good expansion candidate for Analytics module.',
    openTickets: [],
    recentIncidents: [],
  },
  {
    id: CUST.ROCKETSHIP,
    name: 'Rocketship.io',
    slug: 'rocketship-io',
    industry: 'Technology',
    tier: 'smb',
    arr: 18000,
    healthScore: 95,
    health: 'healthy',
    contractRenewalDate: '2026-04-01',
    contacts: [
      { name: 'Tyler Nash', email: 'tyler@rocketship.io', role: 'CEO', isPrimary: true },
    ],
    products: ['prod-platform'],
    usageStats: { monthlyActiveUsers: 23, workflowsRun: 8400, apiCallsPerMonth: 210000 },
    notes: 'Early adopter. Active in community Slack. Good reference customer for startup segment. Series A funding announced December 10 — expansion likely.',
    openTickets: [],
    recentIncidents: [],
  },
  {
    id: CUST.TECHVISION,
    name: 'TechVision Inc',
    slug: 'techvision-inc',
    industry: 'Technology',
    tier: 'enterprise',
    arr: 175000,
    healthScore: 78,
    health: 'healthy',
    contractRenewalDate: '2026-07-31',
    contacts: [
      { name: 'Robert Chen', email: 'robert.chen@techvision.com', role: 'CTO', isPrimary: true },
      { name: 'Amy Liu', email: 'amy.liu@techvision.com', role: 'VP Engineering', isPrimary: false },
    ],
    products: ['prod-platform', 'prod-analytics', 'prod-connect'],
    usageStats: { monthlyActiveUsers: 890, workflowsRun: 210000, apiCallsPerMonth: 5400000 },
    notes: 'Stable account. Interested in SSO (Project Titan). Will likely expand if Titan ships before renewal.',
    openTickets: ['HPLT-815'],
    recentIncidents: [],
  },
];

export function generateCustomers(employees) {
  const csms = employees.filter(e => e.department === 'dept-customer-success');

  // Assign named customers their CSMs
  const namedCustomersProcessed = NAMED_CUSTOMERS.map((c, i) => ({
    ...c,
    csm: csms[i % csms.length]?.id || csms[0]?.id,
  }));

  // Override Acme Corp's CSM with the designated one
  const acme = namedCustomersProcessed.find(c => c.id === CUST.ACME);
  if (acme) acme.csm = EMP.CSM1;

  // Generate filler customers (200 more, starting after named ones)
  const fillerCustomers = [];
  for (let idx = 0; idx < 200; idx++) {
    const i = idx + NAMED_CUSTOMERS.length + 1;
    const companyName = faker.company.name();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g,'').slice(0,25) + `-${i}`;
    const tier = faker.helpers.weightedArrayElement(TIERS);
    const arrByTier = { enterprise: faker.number.int({min:100000,max:500000}), 'mid-market': faker.number.int({min:24000,max:100000}), smb: faker.number.int({min:6000,max:24000}) };
    const selectedProducts = faker.helpers.arrayElements(PRODUCTS, faker.number.int({min:1,max:PRODUCTS.length})).map(p => p.id);
    const numContacts = faker.number.int({min:1,max:3});
    const healthStatus = faker.helpers.weightedArrayElement(HEALTH_STATUS);
    const healthScore = healthStatus === 'healthy' ? faker.number.int({min:72,max:98}) : healthStatus === 'at-risk' ? faker.number.int({min:30,max:64}) : faker.number.int({min:0,max:25});
    fillerCustomers.push({
      id: `cust-${slug}`,
      name: companyName,
      slug,
      industry: faker.helpers.arrayElement(INDUSTRIES),
      tier,
      arr: arrByTier[tier],
      healthScore,
      health: healthStatus,
      contractRenewalDate: faker.date.between({from:'2026-01-01',to:'2026-12-31'}).toISOString().split('T')[0],
      csm: faker.helpers.arrayElement(csms)?.id || null,
      contacts: Array.from({length:numContacts}, () => ({
        name: faker.person.fullName(),
        email: faker.internet.email({provider: slug.replace(/-\d+$/,'')+'.com'}),
        role: faker.helpers.arrayElement(['CTO','VP Engineering','Director of IT','Head of Operations','CEO']),
        isPrimary: false,
      })),
      products: selectedProducts,
      usageStats: null,
      notes: null,
      openTickets: [],
      recentIncidents: [],
    });
  }

  return [...namedCustomersProcessed, ...fillerCustomers];
}
