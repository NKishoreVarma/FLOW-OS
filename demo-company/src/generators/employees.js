/**
 * Employees generator — 450 employees with GitHub/Slack identity and skills.
 * Key scenario characters overlaid AFTER faker generation to preserve sequence.
 */
import faker from '../faker.js';
import { DEPARTMENTS } from '../company.js';
import { EMP } from '../scenarios.js';

const TITLES_BY_DEPT = {
  'dept-executive': ['CEO', 'CTO', 'CPO', 'CFO', 'VP Sales', 'VP Marketing', 'VP Customer Success', 'General Counsel'],
  'dept-eng-platform': ['VP Engineering', 'Senior Engineering Manager', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer', 'Junior Engineer'],
  'dept-eng-analytics': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-eng-connect': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-eng-guard': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-product': ['Chief Product Officer', 'Director of Product', 'Senior Product Manager', 'Product Manager', 'Associate PM'],
  'dept-design': ['VP Design', 'Design Lead', 'Senior Designer', 'Designer', 'UX Researcher'],
  'dept-qa': ['Director of QA', 'QA Lead', 'Senior QA Engineer', 'QA Engineer'],
  'dept-devops': ['VP Infrastructure', 'Site Reliability Lead', 'Senior SRE', 'SRE', 'DevOps Engineer'],
  'dept-customer-success': ['VP Customer Success', 'Director of CS', 'Senior CSM', 'Customer Success Manager', 'CS Associate'],
  'dept-sales': ['VP Sales', 'Director of Sales', 'Senior Account Executive', 'Account Executive', 'Sales Development Rep'],
  'dept-gtm': ['VP Marketing', 'CFO', 'VP HR', 'General Counsel', 'IT Director', 'Marketing Manager', 'HR Manager', 'Finance Manager', 'Legal Counsel', 'IT Engineer'],
};

const SKILLS_BY_DEPT = {
  'dept-executive': [['leadership', 'strategy', 'fundraising'], ['technical-strategy', 'engineering-excellence'], ['product-strategy', 'user-research'], ['financial-planning', 'ipo-readiness'], ['enterprise-sales', 'revenue-operations'], ['go-to-market', 'brand'], ['customer-retention', 'expansion'], ['corporate-law', 'compliance']],
  'dept-eng-platform': [['go', 'kubernetes', 'postgresql', 'distributed-systems'], ['go', 'grpc', 'microservices'], ['typescript', 'react', 'node'], ['python', 'data-pipelines', 'kafka'], ['rust', 'performance', 'memory-safety'], ['java', 'spring-boot'], ['typescript', 'graphql', 'rest']],
  'dept-eng-analytics': [['python', 'apache-spark', 'dbt', 'snowflake'], ['sql', 'postgres', 'clickhouse'], ['python', 'pandas', 'data-engineering'], ['scala', 'flink', 'kafka'], ['python', 'machine-learning', 'sklearn']],
  'dept-eng-connect': [['go', 'oauth2', 'api-design'], ['typescript', 'webhooks', 'event-driven'], ['python', 'rest', 'sdk-development'], ['go', 'grpc', 'protobuf'], ['typescript', 'node', 'integration-testing']],
  'dept-eng-guard': [['rust', 'security', 'cryptography'], ['go', 'zero-trust', 'opa'], ['python', 'penetration-testing', 'threat-modeling'], ['typescript', 'sso', 'saml', 'oidc'], ['compliance', 'fedramp', 'soc2']],
  'dept-product': [['product-strategy', 'roadmap', 'okrs'], ['user-research', 'jobs-to-be-done'], ['enterprise-saas', 'discovery'], ['analytics', 'sql', 'product-analytics'], ['design-thinking', 'prototyping']],
  'dept-design': [['figma', 'design-systems', 'ux'], ['user-research', 'usability-testing'], ['motion-design', 'prototyping'], ['accessibility', 'wcag'], ['illustration', 'brand']],
  'dept-qa': [['test-automation', 'playwright', 'cypress'], ['performance-testing', 'k6', 'jmeter'], ['api-testing', 'postman', 'jest'], ['security-testing', 'owasp']],
  'dept-devops': [['kubernetes', 'terraform', 'aws', 'ci-cd'], ['incident-response', 'sre', 'prometheus'], ['docker', 'helm', 'argocd'], ['networking', 'security-groups', 'vpn'], ['observability', 'grafana', 'opentelemetry']],
  'dept-customer-success': [['salesforce', 'churn-analysis', 'qbr'], ['enterprise-onboarding', 'adoption'], ['customer-health-scoring', 'gainsight'], ['escalation-management', 'executive-relationships'], ['product-training', 'documentation']],
  'dept-sales': [['enterprise-sales', 'meddic', 'salesforce'], ['sales-engineering', 'technical-demos'], ['territory-management', 'forecasting'], ['outbound', 'sdr', 'sequencing'], ['contract-negotiation', 'legal-review']],
  'dept-gtm': [['content-marketing', 'seo', 'demand-gen'], ['financial-modeling', 'gaap'], ['recruiting', 'hrbp', 'performance-management'], ['employment-law', 'equity'], ['it-infrastructure', 'zero-trust-networking']],
};

const LOCATIONS = ['San Francisco', 'New York', 'London', 'Singapore', 'Austin', 'Remote'];

// Canonical characters overlaid after generation — names are deterministic, not faker-random
const CANONICAL_CHARACTERS = {
  [EMP.CEO]:       { firstName: 'James',   lastName: 'Hollis', title: 'CEO',                   skills: ['leadership', 'strategy', 'fundraising', 'enterprise-sales'] },
  [EMP.CTO]:       { firstName: 'Sarah',   lastName: 'Chen',   title: 'VP Engineering',        skills: ['technical-strategy', 'distributed-systems', 'engineering-excellence', 'go'] },
  [EMP.VPEng]:     { firstName: 'Marcus',  lastName: 'Reid',   title: 'Senior Engineering Manager', skills: ['team-building', 'go', 'system-design', 'technical-roadmap'] },
  [EMP.StaffEng1]: { firstName: 'David',   lastName: 'Park',   title: 'Staff Engineer',        skills: ['go', 'auth-service', 'distributed-systems', 'postgresql', 'code-review'], onCall: true },
  [EMP.StaffEng2]: { firstName: 'Priya',   lastName: 'Nair',   title: 'Senior SRE',            skills: ['kubernetes', 'prometheus', 'incident-response', 'python', 'grafana'] },
  [EMP.CISO]:      { firstName: 'Elena',   lastName: 'Vasquez',title: 'VP Security (CISO)',    skills: ['zero-trust', 'compliance', 'penetration-testing', 'threat-modeling'] },
  [EMP.VPProduct]: { firstName: 'Jordan',  lastName: 'Kim',    title: 'Chief Product Officer', skills: ['product-strategy', 'user-research', 'enterprise-saas', 'roadmap', 'okrs'] },
  [EMP.DevOpsLead]:{ firstName: 'Elena',   lastName: 'Torres', title: 'Site Reliability Lead', skills: ['kubernetes', 'terraform', 'aws', 'ci-cd', 'incident-response'] },
  [EMP.SRE1]:      { firstName: 'Kenji',   lastName: 'Watanabe',title:'Senior SRE',            skills: ['kubernetes', 'monitoring', 'postgresql', 'incident-response'] },
  [EMP.SRE2]:      { firstName: 'Anya',    lastName: 'Patel',  title: 'SRE',                  skills: ['prometheus', 'grafana', 'terraform', 'on-call'] },
  [EMP.QALead]:    { firstName: 'Diane',   lastName: 'Foster', title: 'QA Lead',              skills: ['test-automation', 'playwright', 'performance-testing', 'regression-testing'] },
  [EMP.VPSuccess]: { firstName: 'Michael', lastName: 'Santos', title: 'VP Customer Success',  skills: ['customer-retention', 'expansion-revenue', 'churn-analysis', 'executive-relationships'] },
  [EMP.CSM1]:      { firstName: 'James',   lastName: 'Wilks',  title: 'Senior CSM',           skills: ['enterprise-accounts', 'salesforce', 'churn-analysis', 'qbr', 'escalation-management'] },
  [EMP.CSM2]:      { firstName: 'Neha',    lastName: 'Sharma', title: 'Customer Success Manager', skills: ['onboarding', 'adoption', 'customer-health-scoring'] },
  [EMP.VPSales]:   { firstName: 'Daniel',  lastName: 'Wright', title: 'VP Sales',             skills: ['enterprise-sales', 'meddic', 'revenue-operations', 'forecasting'] },
  [EMP.PMAtlas]:   { firstName: 'Yuna',    lastName: 'Lee',    title: 'Senior Product Manager',skills: ['roadmap', 'enterprise-saas', 'technical-pms', 'stakeholder-management'] },
  [EMP.PMRelease]: { firstName: 'Carlos',  lastName: 'Mendez', title: 'Product Manager',      skills: ['release-management', 'agile', 'jira', 'stakeholder-management'] },
};

function githubUsername(firstName, lastName) {
  return `${firstName.toLowerCase()}-${lastName.toLowerCase().replace(/[^a-z]/g, '')}`;
}

function slackId(firstName, lastName) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seed = (firstName + lastName).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  let id = 'U';
  for (let i = 0; i < 9; i++) id += chars[(seed * (i + 1) * 31337) % chars.length];
  return id;
}

export function generateEmployees(departments) {
  const employees = [];
  let counter = 1;

  for (const dept of departments) {
    const titles  = TITLES_BY_DEPT[dept.id] || ['Manager', 'Senior Specialist', 'Specialist'];
    const skills  = SKILLS_BY_DEPT[dept.id] || [['general']];

    for (let i = 0; i < dept.headcount; i++) {
      const id = `emp-${String(counter).padStart(3, '0')}`;
      // Always call faker in same order regardless of overrides (preserves seed sequence)
      const firstName = faker.person.firstName();
      const lastName  = faker.person.lastName();
      const startDate = faker.date.between({ from: '2018-03-15', to: '2025-06-01' }).toISOString().split('T')[0];
      const locIdx    = faker.number.int({ min: 0, max: LOCATIONS.length - 1 });
      const isActive  = faker.number.float() > 0.05;

      const title = titles[Math.min(i, titles.length - 1)];
      const empSkills = skills[Math.min(i, skills.length - 1)];

      employees.push({
        id,
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g,'.')}@heliossoftware.com`,
        title,
        role: i === 0 ? 'ADMIN' : 'MEMBER',
        department: dept.id,
        manager: null,
        location: LOCATIONS[locIdx],
        startDate,
        status: isActive ? 'active' : 'inactive',
        githubUsername: githubUsername(firstName, lastName),
        slackId: slackId(firstName, lastName),
        skills: empSkills,
      });
      counter++;
    }
  }

  // Wire managers
  let offset = 0;
  for (const dept of departments) {
    const deptEmps = employees.slice(offset, offset + dept.headcount);
    if (deptEmps[0].id !== EMP.CEO) deptEmps[0].manager = EMP.CEO;
    for (let i = 1; i < deptEmps.length; i++) {
      const managerIdx = i <= 3 ? 0 : faker.number.int({ min: 0, max: Math.min(i, 3) - 1 });
      deptEmps[i].manager = deptEmps[managerIdx].id;
    }
    offset += dept.headcount;
  }

  // Overlay canonical characters AFTER all faker calls (preserves sequence)
  for (const [id, overrides] of Object.entries(CANONICAL_CHARACTERS)) {
    const emp = employees.find(e => e.id === id);
    if (!emp) continue;
    const fn = overrides.firstName, ln = overrides.lastName;
    emp.name  = `${fn} ${ln}`;
    emp.email = `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[^a-z]/g,'.')}@heliossoftware.com`;
    emp.title = overrides.title;
    emp.skills = overrides.skills || emp.skills;
    emp.githubUsername = githubUsername(fn, ln);
    emp.slackId = slackId(fn, ln);
    if (overrides.onCall) emp.onCall = true;
  }

  return employees;
}
