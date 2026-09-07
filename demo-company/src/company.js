export const COMPANY = {
  name: 'Helios Software Inc.',
  slug: 'helios',
  legalName: 'Helios Software, Inc.',
  founded: '2018-03-15',
  industry: 'B2B Enterprise SaaS',
  website: 'https://heliossoftware.com',
  hq: 'San Francisco, CA',
  offices: ['San Francisco', 'New York', 'London', 'Singapore', 'Austin'],
  headcount: 450,
  arr: '$48M',
  customers: 210,
  description: 'Enterprise workflow automation and intelligence platform for modern operations teams.',
};

export const PRODUCTS = [
  { id: 'prod-platform', name: 'Helios Platform', slug: 'platform', description: 'Core enterprise workflow and automation engine', repos: 5, jiraKey: 'HPLT', teamDept: 'dept-eng-platform' },
  { id: 'prod-analytics', name: 'Helios Analytics', slug: 'analytics', description: 'Real-time business intelligence and reporting', repos: 4, jiraKey: 'HANA', teamDept: 'dept-eng-analytics' },
  { id: 'prod-connect', name: 'Helios Connect', slug: 'connect', description: 'API integration hub and connector marketplace', repos: 4, jiraKey: 'HCON', teamDept: 'dept-eng-connect' },
  { id: 'prod-guard', name: 'Helios Guard', slug: 'guard', description: 'Security, compliance, and access control platform', repos: 3, jiraKey: 'HGRD', teamDept: 'dept-eng-guard' },
];

export const DEPARTMENTS = [
  { id: 'dept-executive', name: 'Executive', slug: 'executive', headcount: 8 },
  { id: 'dept-eng-platform', name: 'Engineering — Platform', slug: 'eng-platform', headcount: 85 },
  { id: 'dept-eng-analytics', name: 'Engineering — Analytics', slug: 'eng-analytics', headcount: 60 },
  { id: 'dept-eng-connect', name: 'Engineering — Connect', slug: 'eng-connect', headcount: 55 },
  { id: 'dept-eng-guard', name: 'Engineering — Guard', slug: 'eng-guard', headcount: 40 },
  { id: 'dept-product', name: 'Product', slug: 'product', headcount: 28 },
  { id: 'dept-design', name: 'Design', slug: 'design', headcount: 18 },
  { id: 'dept-qa', name: 'Quality Assurance', slug: 'qa', headcount: 22 },
  { id: 'dept-devops', name: 'DevOps & Infrastructure', slug: 'devops', headcount: 20 },
  { id: 'dept-customer-success', name: 'Customer Success', slug: 'customer-success', headcount: 45 },
  { id: 'dept-sales', name: 'Sales', slug: 'sales', headcount: 50 },
  { id: 'dept-gtm', name: 'Marketing, Finance, HR, Legal, IT', slug: 'gtm', headcount: 19 },
];
