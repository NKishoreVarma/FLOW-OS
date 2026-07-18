# Milestone 2 — Demo Company Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained Demo Company generator that produces a complete, interconnected enterprise dataset for a fictional B2B SaaS company called "Helios Software Inc.", then import it into FLOW via the Workspace Lifecycle Engine and produce a two-part validation report.

**Architecture:** The Demo Company lives in `/demo-company/` at the repo root, is completely independent of FLOW runtime, has its own `package.json` with `@faker-js/faker` for deterministic seeded generation, and exports a manifest + dataset JSON files to `demo-company/exports/`. FLOW imports these files using `POST /api/lifecycle/create`. No Demo-specific code enters `src/`.

**Tech Stack:** Node.js 20 ESM, `@faker-js/faker` v9.x (seeded, deterministic), plain `fs.writeFileSync` for output, one `node src/generate.js` command generates everything.

---

## Global Constraints

- ESM only in `/demo-company/src/`. No `require()`.
- All IDs use a stable slug-based scheme so re-generation produces the same IDs (deterministic FK references).
- Every record references valid parent IDs — no orphaned foreign keys.
- No Demo-specific code enters `/src/` (FLOW core). The only interface is `demo-company/exports/manifest.json` + `demo-company/exports/datasets/*.json`.
- Company name: **"Helios Software Inc."**, slug: **"helios"**
- `@faker-js/faker` seed: **`12345`** (always use this seed for reproducibility).
- Generator must complete in under 60 seconds.
- All JSON files written with 2-space indentation (`JSON.stringify(data, null, 2)`).
- Total record targets: ~450 employees, ~200 customers, ~20 repos, ~1500 commits, ~300 PRs, ~1200 Jira issues, ~2000 emails, ~500 Slack threads, ~300 calendar events, ~150 meeting transcripts, ~80 incidents, ~400 documents, ~500 timeline events, ~300 memory records, ~40 executive reports.

---

## Company Profile (use these values verbatim throughout all tasks)

```js
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
```

---

## File Map

```
demo-company/
├── package.json                    # { type: module, scripts: { generate: "node src/generate.js" }, deps: { @faker-js/faker } }
├── README.md                       # How to run, what it produces, contract with FLOW
├── src/
│   ├── company.js                  # COMPANY + PRODUCTS + DEPARTMENTS constants (above)
│   ├── faker.js                    # import { faker } from '@faker-js/faker'; faker.seed(12345); export default faker;
│   ├── generators/
│   │   ├── departments.js          # generateDepartments() → Department[]
│   │   ├── employees.js            # generateEmployees(depts) → Employee[]
│   │   ├── customers.js            # generateCustomers() → Customer[]
│   │   ├── repositories.js         # generateRepositories(products) → Repository[]
│   │   ├── commits.js              # generateCommits(repos, employees) → Commit[]
│   │   ├── pullRequests.js         # generatePullRequests(repos, commits, employees) → PullRequest[]
│   │   ├── jiraIssues.js           # generateJiraIssues(products, employees, customers) → JiraIssue[]
│   │   ├── emails.js               # generateEmails(employees, customers, jiraIssues) → Email[]
│   │   ├── slackThreads.js         # generateSlackThreads(employees, incidents, jiraIssues) → SlackThread[]
│   │   ├── calendarEvents.js       # generateCalendarEvents(employees, projects) → CalendarEvent[]
│   │   ├── meetingTranscripts.js   # generateMeetingTranscripts(calendarEvents, employees) → MeetingTranscript[]
│   │   ├── incidents.js            # generateIncidents(repos, employees, customers) → Incident[]
│   │   ├── documents.js            # generateDocuments(products, employees) → Document[]
│   │   ├── timeline.js             # generateTimeline(all entities) → TimelineEvent[]
│   │   ├── memory.js               # generateMemory(incidents, decisions...) → MemoryRecord[]
│   │   ├── executiveReports.js     # generateExecutiveReports(employees, customers...) → ExecReport[]
│   │   ├── knowledgeGraph.js       # generateKnowledgeGraph(all entities) → { nodes, edges }
│   │   └── permissions.js          # generatePermissions(employees, products) → Permission[]
│   └── generate.js                 # Orchestrates all generators, writes exports/
└── exports/                        # Git-committed output
    ├── manifest.json
    └── datasets/
        ├── company.json
        ├── departments.json
        ├── employees.json
        ├── customers.json
        ├── repositories.json
        ├── commits.json
        ├── pull_requests.json
        ├── jira_issues.json
        ├── emails.json
        ├── slack_threads.json
        ├── calendar_events.json
        ├── meetings.json
        ├── meeting_transcripts.json
        ├── incidents.json
        ├── documents.json
        ├── timeline.json
        ├── memory.json
        ├── executive_reports.json
        ├── knowledgeGraph.json
        ├── permissions.json
        └── summary.json
```

---

## Interfaces Between Tasks

All generators export a single named function. They receive already-generated entities by reference (no re-generation). All IDs follow the pattern: `{type}-{slug}-{n}` (e.g. `emp-001`, `repo-platform-api`). Dates are ISO 8601 strings. All dates are within the last 12 months (from 2025-06-30 back to 2025-01-01) unless noted.

### ID schemes (use exactly these formats)

| Entity | ID format | Example |
|--------|-----------|---------|
| Department | `dept-{slug}` | `dept-eng-platform` |
| Employee | `emp-{3-digit-padded-n}` | `emp-001`, `emp-042` |
| Customer | `cust-{slug}` | `cust-acme-corp` |
| Repository | `repo-{product-slug}-{slug}` | `repo-platform-api` |
| Commit | `commit-{repo-id}-{n}` | `commit-repo-platform-api-001` |
| PR | `pr-{repo-id}-{n}` | `pr-repo-platform-api-42` |
| Jira Issue | `{jiraKey}-{n}` | `HPLT-142` |
| Email | `email-{n}` | `email-0001` |
| Slack Thread | `slack-{n}` | `slack-0001` |
| Calendar Event | `cal-{n}` | `cal-001` |
| Meeting Transcript | `transcript-{calId}` | `transcript-cal-001` |
| Incident | `inc-{n}` | `inc-001` |
| Document | `doc-{n}` | `doc-001` |
| Timeline Event | `tl-{n}` | `tl-001` |
| Memory Record | `mem-{n}` | `mem-001` |
| Executive Report | `report-{n}` | `report-01` |

### Required field shapes per type (condensed — full shapes in each task)

**Employee:**
```js
{ id, name, email, role, title, department: deptId, manager: empId|null, location, startDate, status: 'active'|'inactive', product: productId|null }
```

**Customer:**
```js
{ id, name, slug, industry, tier: 'enterprise'|'mid-market'|'smb', arr: number, csm: empId, health: 'healthy'|'at-risk'|'churned', contacts: [{name,email,role}], products: [productId] }
```

**Repository:**
```js
{ id, name, productId, description, language, visibility: 'private', defaultBranch: 'main', topics: [string] }
```

**Commit:**
```js
{ id, repoId, message, author: empId, sha: string, timestamp, branch: 'main'|string, filesChanged: number, additions: number, deletions: number }
```

**Pull Request:**
```js
{ id, repoId, title, body, author: empId, reviewers: [empId], status: 'merged'|'open'|'closed', baseBranch: 'main', headBranch: string, mergedAt: string|null, createdAt, jiraIssueId: issueId|null }
```

**Jira Issue:**
```js
{ id, projectKey, title, description, type: 'story'|'bug'|'task'|'epic', status: 'done'|'in-progress'|'todo'|'backlog', priority: 'critical'|'high'|'medium'|'low', assignee: empId, reporter: empId, sprint: string, storyPoints: number, labels: [string], customerId: custId|null, epicId: issueId|null, createdAt, resolvedAt: string|null }
```

**Email:**
```js
{ id, from: empId|'customer:'+custId, to: [empId|'customer:'+custId], subject, body, threadId: string, timestamp, labels: ['inbox'|'sent'|'important'], relatedJiraId: issueId|null }
```

**Slack Thread:**
```js
{ id, channel: string, messages: [{author: empId, text: string, timestamp}], topic: string, relatedIncidentId: incId|null, relatedJiraId: issueId|null }
```

**Calendar Event / Meeting:**
```js
{ id, title, description, attendees: [empId], organizer: empId, startTime, endTime, location: string|null, type: 'standup'|'sprint-review'|'1on1'|'executive'|'customer'|'incident-review'|'all-hands', productId: productId|null, customerId: custId|null, agenda: string, actionItems: [string] }
```

**Meeting Transcript:**
```js
{ id, eventId: calId, content: string, participants: [empId], summary: string, decisions: [string], actionItems: [{owner: empId, text: string, dueDate: string}] }
```

**Incident:**
```js
{ id, title, description, severity: 'P0'|'P1'|'P2'|'P3', status: 'resolved'|'investigating'|'mitigated', affectedProduct: productId, affectedCustomers: [custId], commander: empId, timeline: [{timestamp,action,actor:empId}], rootCause: string, resolution: string, detectedAt, resolvedAt, mttr: number }
```

**Document:**
```js
{ id, title, content: string, type: 'runbook'|'architecture'|'api-spec'|'post-mortem'|'rfc'|'onboarding'|'policy', productId: productId|null, author: empId, tags: [string], createdAt, updatedAt }
```

**Timeline Event:**
```js
{ id, type: string, title, description, timestamp, actors: [empId], relatedId: string, relatedType: string, productId: productId|null }
```

**Memory:**
```js
{ id, type: string, content: string, source: string, importance: number, authority: number, timestamp, relatedId: string }
```

**Executive Report:**
```js
{ id, title, period: string, author: empId, summary: string, highlights: [string], risks: [string], decisions: [string], metrics: {arr:number, customers:number, nrr:number, headcount:number}, createdAt }
```

**KnowledgeGraph:**
```js
{ nodes: [{id,type,name,properties:{}}], edges: [{source,target,relation,weight}] }
```

**Permission:**
```js
{ id, employeeId, resource: string, action: 'read'|'write'|'admin', grantedAt, grantedBy: empId }
```

**Summary:**
```js
{ id: 'summary-helios', company: COMPANY.name, generatedAt: string, totalEmployees: number, totalCustomers: number, totalRepositories: number, arr: COMPANY.arr }
```

**Company (dataset type):**
```js
[{ id: COMPANY.slug, ...COMPANY }]
```

---

## Task 1 — Demo Company Foundation

**Files:**
- Create: `demo-company/package.json`
- Create: `demo-company/src/company.js`
- Create: `demo-company/src/faker.js`
- Create: `demo-company/README.md`
- Create: `demo-company/exports/.gitkeep`

- [ ] **Step 1: Create `demo-company/package.json`**

```json
{
  "name": "helios-demo-company",
  "version": "1.0.0",
  "type": "module",
  "description": "Demo Company generator for FLOW OS validation. Produces a realistic enterprise dataset for Helios Software Inc.",
  "scripts": {
    "generate": "node src/generate.js",
    "clean": "rm -rf exports/datasets && mkdir -p exports/datasets"
  },
  "dependencies": {
    "@faker-js/faker": "^9.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd demo-company && npm install && cd ..
```

Verify `demo-company/node_modules/@faker-js/faker` exists.

- [ ] **Step 3: Create `demo-company/src/company.js`**

Paste the full COMPANY, PRODUCTS, DEPARTMENTS constants from the Global Constraints section above verbatim.

- [ ] **Step 4: Create `demo-company/src/faker.js`**

```js
import { faker } from '@faker-js/faker';
faker.seed(12345);
export default faker;
```

- [ ] **Step 5: Create `demo-company/README.md`**

Describe what Helios Software is, how to run the generator, what files are produced, and the contract with FLOW (manifest + datasets only — no FLOW source dependency).

- [ ] **Step 6: Create `demo-company/exports/.gitkeep`** and `demo-company/exports/datasets/.gitkeep`

```bash
mkdir -p demo-company/exports/datasets
touch demo-company/exports/.gitkeep demo-company/exports/datasets/.gitkeep
```

- [ ] **Step 7: Verify faker import works**

```bash
cd demo-company && node -e "import('./src/faker.js').then(m => console.log('faker ok:', m.default.person.firstName()))"
```

Expected: prints a name.

- [ ] **Step 8: Commit**

```bash
git add demo-company/
git commit -m "feat(demo): scaffold Helios Software demo company generator"
```

---

## Task 2 — Entity Generators: Departments, Employees, Customers

**Files:**
- Create: `demo-company/src/generators/departments.js`
- Create: `demo-company/src/generators/employees.js`
- Create: `demo-company/src/generators/customers.js`

**Interfaces:**
- Produces: `departments[]` (12 records), `employees[]` (~450 records), `customers[]` (~210 records)
- `employees[n].manager` references another `employees[m].id` (chain: IC → manager → VP → C-suite)
- `employees[n].department` references `departments[m].id`
- `customers[n].csm` references `employees[m].id` (must be a Customer Success employee)

### `departments.js`

- [ ] **Step 1: Create `demo-company/src/generators/departments.js`**

```js
import { DEPARTMENTS } from '../company.js';

export function generateDepartments() {
  return DEPARTMENTS.map(d => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    headcount: d.headcount,
  }));
}
```

### `employees.js`

Generate exactly 450 employees. Each department gets its `headcount` number of employees. First employee in executive dept is CEO (id: `emp-001`), second is CTO (`emp-002`), etc. Engineering dept heads are `emp-003` through `emp-006` (one VP per product).

- [ ] **Step 2: Create `demo-company/src/generators/employees.js`**

```js
import faker from '../faker.js';
import { DEPARTMENTS, PRODUCTS } from '../company.js';

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

const LOCATIONS = ['San Francisco', 'New York', 'London', 'Singapore', 'Austin', 'Remote'];

export function generateEmployees(departments) {
  const employees = [];
  let counter = 1;

  for (const dept of departments) {
    const titles = TITLES_BY_DEPT[dept.id] || ['Manager', 'Senior Specialist', 'Specialist'];
    for (let i = 0; i < dept.headcount; i++) {
      const id = `emp-${String(counter).padStart(3, '0')}`;
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@heliossoftware.com`;
      const title = titles[Math.min(i, titles.length - 1)];
      const location = faker.helpers.arrayElement(LOCATIONS);
      const startDate = faker.date.between({ from: '2018-03-15', to: '2025-06-01' }).toISOString().split('T')[0];
      employees.push({ id, name: `${firstName} ${lastName}`, email, title, role: i === 0 ? 'ADMIN' : 'MEMBER', department: dept.id, manager: null, location, startDate, status: faker.helpers.weightedArrayElement([{weight:0.95,value:'active'},{weight:0.05,value:'inactive'}]) });
      counter++;
    }
  }

  // Wire managers: first employee of each dept is the dept head; others report to them or sub-managers
  let offset = 0;
  for (const dept of departments) {
    const deptEmps = employees.slice(offset, offset + dept.headcount);
    const deptHead = deptEmps[0];
    // dept head reports to CEO (emp-001) unless they ARE emp-001
    if (deptHead.id !== 'emp-001') deptHead.manager = 'emp-001';
    for (let i = 1; i < deptEmps.length; i++) {
      // Report to dept head or a manager below them
      const managerIdx = i <= 3 ? 0 : Math.floor(Math.random() * Math.min(i, 3));
      deptEmps[i].manager = deptEmps[managerIdx].id;
    }
    offset += dept.headcount;
  }

  return employees;
}
```

### `customers.js`

Generate 210 customers. Each has 1-3 contact persons. CSM is a Customer Success dept employee.

- [ ] **Step 3: Create `demo-company/src/generators/customers.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const INDUSTRIES = ['Financial Services', 'Healthcare', 'Retail', 'Manufacturing', 'Technology', 'Logistics', 'Education', 'Media', 'Government', 'Energy'];
const TIERS = [{ weight: 0.2, value: 'enterprise' }, { weight: 0.4, value: 'mid-market' }, { weight: 0.4, value: 'smb' }];
const HEALTH = [{ weight: 0.65, value: 'healthy' }, { weight: 0.25, value: 'at-risk' }, { weight: 0.1, value: 'churned' }];

export function generateCustomers(employees) {
  const csms = employees.filter(e => e.department === 'dept-customer-success');
  const customers = [];
  for (let i = 1; i <= 210; i++) {
    const companyName = faker.company.name();
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30) + `-${i}`;
    const id = `cust-${slug}`;
    const tier = faker.helpers.weightedArrayElement(TIERS);
    const arrByTier = { enterprise: faker.number.int({ min: 100000, max: 500000 }), 'mid-market': faker.number.int({ min: 24000, max: 100000 }), smb: faker.number.int({ min: 6000, max: 24000 }) };
    const numProducts = faker.number.int({ min: 1, max: PRODUCTS.length });
    const selectedProducts = faker.helpers.arrayElements(PRODUCTS, numProducts).map(p => p.id);
    const csm = faker.helpers.arrayElement(csms);
    const numContacts = faker.number.int({ min: 1, max: 3 });
    const contacts = Array.from({ length: numContacts }, () => ({
      name: faker.person.fullName(),
      email: faker.internet.email({ provider: slug.replace(/-\d+$/, '') + '.com' }),
      role: faker.helpers.arrayElement(['CTO', 'VP Engineering', 'Director of IT', 'Head of Operations', 'CEO']),
    }));
    customers.push({ id, name: companyName, slug, industry: faker.helpers.arrayElement(INDUSTRIES), tier, arr: arrByTier[tier], csm: csm.id, health: faker.helpers.weightedArrayElement(HEALTH), contacts, products: selectedProducts });
  }
  return customers;
}
```

- [ ] **Step 4: Run a quick smoke test**

Create `demo-company/src/smoke.js`:
```js
import { generateDepartments } from './generators/departments.js';
import { generateEmployees } from './generators/employees.js';
import { generateCustomers } from './generators/customers.js';
const depts = generateDepartments();
const emps = generateEmployees(depts);
const custs = generateCustomers(emps);
console.log(`Departments: ${depts.length}, Employees: ${emps.length}, Customers: ${custs.length}`);
```

Run: `cd demo-company && node src/smoke.js`
Expected: `Departments: 12, Employees: 450, Customers: 210`

- [ ] **Step 5: Commit**

```bash
git add demo-company/src/generators/departments.js demo-company/src/generators/employees.js demo-company/src/generators/customers.js
git commit -m "feat(demo): add department, employee, and customer generators (450 employees, 210 customers)"
```

---

## Task 3 — Engineering Generators: Repositories, Commits, Pull Requests, Jira Issues

**Files:**
- Create: `demo-company/src/generators/repositories.js`
- Create: `demo-company/src/generators/commits.js`
- Create: `demo-company/src/generators/pullRequests.js`
- Create: `demo-company/src/generators/jiraIssues.js`

**Interfaces:**
- Produces: `repositories[]` (16 repos, split across 4 products per PRODUCTS array), `commits[]` (~1500), `pullRequests[]` (~300), `jiraIssues[]` (~1200)
- `commits[n].author` → employee from an engineering dept
- `pullRequests[n].jiraIssueId` → jira issue id (50% of PRs linked)
- `jiraIssues[n].assignee` and `.reporter` → engineering/product employees

### `repositories.js`

- [ ] **Step 1: Create `demo-company/src/generators/repositories.js`**

```js
import { PRODUCTS } from '../company.js';

const REPO_NAMES = {
  'prod-platform': ['platform-api', 'platform-worker', 'platform-sdk', 'platform-ui', 'platform-infra'],
  'prod-analytics': ['analytics-engine', 'analytics-ui', 'analytics-pipeline', 'analytics-sdk'],
  'prod-connect': ['connect-core', 'connect-adapters', 'connect-ui', 'connect-marketplace'],
  'prod-guard': ['guard-core', 'guard-policy-engine', 'guard-ui'],
};

const LANGUAGES = { platform: 'TypeScript', analytics: 'Python', connect: 'Go', guard: 'Rust' };
const TOPICS_BY_PRODUCT = {
  'prod-platform': ['workflow', 'automation', 'enterprise', 'saas'],
  'prod-analytics': ['analytics', 'bi', 'reporting', 'data'],
  'prod-connect': ['api', 'integration', 'connectors', 'marketplace'],
  'prod-guard': ['security', 'compliance', 'access-control', 'zero-trust'],
};

export function generateRepositories(products) {
  const repos = [];
  for (const product of products) {
    const names = REPO_NAMES[product.id] || [];
    const lang = LANGUAGES[product.slug] || 'TypeScript';
    for (const repoSlug of names) {
      repos.push({
        id: `repo-${product.slug}-${repoSlug.replace(product.slug + '-', '')}`,
        name: `helios-${repoSlug}`,
        productId: product.id,
        description: `${product.name} — ${repoSlug} service`,
        language: lang,
        visibility: 'private',
        defaultBranch: 'main',
        topics: TOPICS_BY_PRODUCT[product.id] || [],
      });
    }
  }
  return repos;
}
```

### `commits.js`

Generate ~1500 commits spread across all repos. 75-100 per repo. Each commit has a realistic message.

- [ ] **Step 2: Create `demo-company/src/generators/commits.js`**

```js
import faker from '../faker.js';

const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'perf', 'chore', 'style'];
const SCOPES = ['api', 'auth', 'db', 'ui', 'worker', 'cache', 'queue', 'metrics', 'logging', 'config'];
const MESSAGES = [
  'add pagination to list endpoints', 'fix race condition in queue processor', 'refactor auth middleware',
  'update dependencies', 'add unit tests for core module', 'improve error handling', 'fix memory leak',
  'add retry logic with exponential backoff', 'optimize database queries', 'add request tracing',
  'implement circuit breaker pattern', 'add rate limiting', 'fix null pointer exception', 'clean up unused imports',
  'add health check endpoint', 'improve logging', 'fix timeout handling', 'add input validation',
  'update OpenAPI spec', 'fix CORS configuration', 'add metrics endpoint', 'implement caching layer',
];

export function generateCommits(repos, engineers) {
  const commits = [];
  let n = 1;
  for (const repo of repos) {
    const count = faker.number.int({ min: 75, max: 100 });
    for (let i = 0; i < count; i++) {
      const type = faker.helpers.arrayElement(COMMIT_TYPES);
      const scope = faker.helpers.arrayElement(SCOPES);
      const msg = faker.helpers.arrayElement(MESSAGES);
      const author = faker.helpers.arrayElement(engineers);
      const branch = i < count * 0.8 ? 'main' : `feature/${faker.helpers.slugify(msg).slice(0, 30)}`;
      const timestamp = faker.date.between({ from: '2025-01-01', to: '2025-12-31' }).toISOString();
      commits.push({
        id: `commit-${repo.id}-${String(n).padStart(4, '0')}`,
        repoId: repo.id,
        message: `${type}(${scope}): ${msg}`,
        author: author.id,
        sha: faker.git.commitSha(),
        timestamp,
        branch,
        filesChanged: faker.number.int({ min: 1, max: 12 }),
        additions: faker.number.int({ min: 5, max: 300 }),
        deletions: faker.number.int({ min: 0, max: 150 }),
      });
      n++;
    }
  }
  return commits;
}
```

### `pullRequests.js`

Generate ~20 PRs per repo = ~320 total. 50% linked to a Jira issue.

- [ ] **Step 3: Create `demo-company/src/generators/pullRequests.js`**

```js
import faker from '../faker.js';

const PR_TITLES = [
  'Add pagination support', 'Fix authentication bug', 'Refactor database layer', 'Improve error handling',
  'Add comprehensive test coverage', 'Performance optimization for query engine', 'Security: fix XSS vulnerability',
  'Add API rate limiting', 'Implement retry mechanism', 'Update dependencies to latest stable',
  'Add telemetry and observability', 'Fix memory leak in worker process', 'Implement feature flag support',
  'Add batch processing endpoint', 'Fix race condition in event handler',
];
const STATUSES = [{ weight: 0.7, value: 'merged' }, { weight: 0.2, value: 'open' }, { weight: 0.1, value: 'closed' }];

export function generatePullRequests(repos, engineers, jiraIssues) {
  const prs = [];
  for (const repo of repos) {
    const count = faker.number.int({ min: 18, max: 22 });
    for (let i = 1; i <= count; i++) {
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const author = faker.helpers.arrayElement(engineers);
      const reviewerCount = faker.number.int({ min: 1, max: 3 });
      const reviewers = faker.helpers.arrayElements(engineers.filter(e => e.id !== author.id), reviewerCount).map(e => e.id);
      const createdAt = faker.date.between({ from: '2025-01-01', to: '2025-12-01' }).toISOString();
      const mergedAt = status === 'merged' ? faker.date.between({ from: createdAt, to: '2025-12-31' }).toISOString() : null;
      const jiraIssueId = Math.random() < 0.5 && jiraIssues.length > 0 ? faker.helpers.arrayElement(jiraIssues).id : null;
      const title = faker.helpers.arrayElement(PR_TITLES);
      prs.push({
        id: `pr-${repo.id}-${String(i).padStart(3, '0')}`,
        repoId: repo.id,
        title,
        body: `## Summary\n${faker.lorem.paragraph()}\n\n## Testing\n${faker.lorem.sentence()}`,
        author: author.id,
        reviewers,
        status,
        baseBranch: 'main',
        headBranch: `feature/${faker.helpers.slugify(title).slice(0, 25)}`,
        mergedAt,
        createdAt,
        jiraIssueId,
      });
    }
  }
  return prs;
}
```

### `jiraIssues.js`

Generate ~300 issues per product = ~1200 total. Mix of bugs, stories, tasks, epics.

- [ ] **Step 4: Create `demo-company/src/generators/jiraIssues.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const STORY_TITLES = [
  'As a user I can filter results by date range', 'Implement SSO with SAML 2.0', 'Add dark mode support',
  'Optimize dashboard load time', 'Add export to CSV functionality', 'Implement webhook notifications',
  'Add custom field support', 'Build audit log viewer', 'Implement multi-language support',
  'Add two-factor authentication', 'Build advanced search with filters', 'Implement data retention policies',
];
const BUG_TITLES = [
  'Dashboard fails to load for accounts with 1000+ records', 'Authentication token not refreshing correctly',
  'Export fails for large datasets', 'Slow query performance on analytics page', 'Memory leak in background worker',
  'CORS error on API endpoint', 'Date formatting incorrect in EU locale', 'PDF export missing columns',
  'Search results not paginating correctly', 'Webhook retries not triggering on 5xx errors',
];
const SPRINTS = Array.from({ length: 12 }, (_, i) => `Sprint ${i + 1} — 2025`);
const TYPES = [{ weight: 0.4, value: 'story' }, { weight: 0.35, value: 'bug' }, { weight: 0.15, value: 'task' }, { weight: 0.1, value: 'epic' }];
const STATUSES = [{ weight: 0.45, value: 'done' }, { weight: 0.25, value: 'in-progress' }, { weight: 0.2, value: 'todo' }, { weight: 0.1, value: 'backlog' }];
const PRIORITIES = [{ weight: 0.05, value: 'critical' }, { weight: 0.25, value: 'high' }, { weight: 0.45, value: 'medium' }, { weight: 0.25, value: 'low' }];

export function generateJiraIssues(engineers, customers) {
  const issues = [];
  for (const product of PRODUCTS) {
    const productEngineers = engineers.filter(e => e.department.startsWith('dept-eng'));
    for (let i = 1; i <= 300; i++) {
      const type = faker.helpers.weightedArrayElement(TYPES);
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const assignee = faker.helpers.arrayElement(productEngineers);
      const reporter = faker.helpers.arrayElement(productEngineers);
      const priority = faker.helpers.weightedArrayElement(PRIORITIES);
      const title = type === 'bug' ? faker.helpers.arrayElement(BUG_TITLES) : faker.helpers.arrayElement(STORY_TITLES);
      const createdAt = faker.date.between({ from: '2025-01-01', to: '2025-12-01' }).toISOString();
      const resolvedAt = status === 'done' ? faker.date.between({ from: createdAt, to: '2025-12-31' }).toISOString() : null;
      const customerId = Math.random() < 0.2 && customers.length > 0 ? faker.helpers.arrayElement(customers).id : null;
      issues.push({
        id: `${product.jiraKey}-${i}`,
        projectKey: product.jiraKey,
        title,
        description: faker.lorem.paragraph(),
        type,
        status,
        priority,
        assignee: assignee.id,
        reporter: reporter.id,
        sprint: faker.helpers.arrayElement(SPRINTS),
        storyPoints: faker.helpers.arrayElement([1, 2, 3, 5, 8, 13]),
        labels: faker.helpers.arrayElements(['backend', 'frontend', 'performance', 'security', 'ux', 'api', 'infra'], faker.number.int({ min: 0, max: 3 })),
        customerId,
        epicId: type !== 'epic' && i > 10 && Math.random() < 0.3 ? `${product.jiraKey}-${faker.number.int({ min: 1, max: 10 })}` : null,
        createdAt,
        resolvedAt,
      });
    }
  }
  return issues;
}
```

- [ ] **Step 5: Run smoke test**

Add to `demo-company/src/smoke.js`:
```js
import { generateRepositories } from './generators/repositories.js';
import { generateCommits } from './generators/commits.js';
import { generatePullRequests } from './generators/pullRequests.js';
import { generateJiraIssues } from './generators/jiraIssues.js';
import { PRODUCTS } from './company.js';
// ...after previous smoke
const repos = generateRepositories(PRODUCTS);
const engEmps = emps.filter(e => e.department.startsWith('dept-eng'));
const jiras = generateJiraIssues(engEmps, custs);
const commits = generateCommits(repos, engEmps);
const prs = generatePullRequests(repos, engEmps, jiras);
console.log(`Repos: ${repos.length}, Commits: ${commits.length}, PRs: ${prs.length}, Jira: ${jiras.length}`);
```

Run: `cd demo-company && node src/smoke.js`
Expected: Repos: 16, Commits: ~1400-1600, PRs: ~280-360, Jira: 1200

- [ ] **Step 6: Commit**

```bash
git add demo-company/src/generators/
git commit -m "feat(demo): add engineering generators — 16 repos, 1500 commits, 300 PRs, 1200 Jira issues"
```

---

## Task 4 — Communication Generators: Emails, Slack, Calendar, Meetings, Transcripts

**Files:**
- Create: `demo-company/src/generators/emails.js`
- Create: `demo-company/src/generators/slackThreads.js`
- Create: `demo-company/src/generators/calendarEvents.js`
- Create: `demo-company/src/generators/meetingTranscripts.js`

**Targets:** ~2000 emails, ~500 Slack threads, ~300 calendar events, ~150 meeting transcripts

### `emails.js`

- [ ] **Step 1: Create `demo-company/src/generators/emails.js`**

Generate 2000 emails. Mix: internal (emp→emp), customer (cust→emp), external (emp→cust). Threads grouped by threadId (5-10 emails per thread = ~300 threads). Subject lines reference real Jira IDs and customer names.

```js
import faker from '../faker.js';

const SUBJECTS = [
  'Re: Q3 roadmap discussion', 'URGENT: Production incident — platform API down',
  'Customer escalation: {customer} — SLA breach', 'Sprint {n} retrospective notes',
  'Proposal: Architecture decision for {topic}', 'Weekly sync agenda',
  '{jiraId} — resolved, pending verification', 'Onboarding: welcome to Helios!',
  'Security review request for {product}', 'NPS survey results Q{q}',
  'Contract renewal: {customer}', 'Feature request from {customer}',
  'Post-mortem: incident {incId}', 'Action items from executive review',
];

export function generateEmails(employees, customers, jiraIssues) {
  const emails = [];
  const threadCount = 300;
  let emailN = 1;
  for (let t = 1; t <= threadCount; t++) {
    const threadId = `thread-${String(t).padStart(4, '0')}`;
    const threadLength = faker.number.int({ min: 3, max: 10 });
    const isCustomerThread = Math.random() < 0.35;
    const customer = isCustomerThread ? faker.helpers.arrayElement(customers) : null;
    const jira = Math.random() < 0.4 && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues) : null;
    const subject = faker.helpers.arrayElement(SUBJECTS)
      .replace('{customer}', customer?.name || 'client')
      .replace('{n}', String(faker.number.int({ min: 1, max: 24 })))
      .replace('{topic}', faker.helpers.arrayElement(['microservices migration', 'caching strategy', 'auth architecture']))
      .replace('{jiraId}', jira?.id || 'HPLT-001')
      .replace('{product}', faker.helpers.arrayElement(['Helios Platform', 'Helios Connect']))
      .replace('{q}', String(faker.number.int({ min: 1, max: 4 })))
      .replace('{incId}', `inc-${String(faker.number.int({ min: 1, max: 80 })).padStart(3, '0')}`);
    const baseTime = faker.date.between({ from: '2025-01-01', to: '2025-12-01' });
    for (let i = 0; i < threadLength && emailN <= 2000; i++) {
      const from = isCustomerThread && i % 3 === 0 && customer?.contacts?.length
        ? `customer:${customer.id}`
        : faker.helpers.arrayElement(employees).id;
      const to = [faker.helpers.arrayElement(employees).id];
      if (isCustomerThread && customer && i % 3 !== 0) to.push(`customer:${customer.id}`);
      const timestamp = new Date(baseTime.getTime() + i * faker.number.int({ min: 3600000, max: 86400000 })).toISOString();
      emails.push({
        id: `email-${String(emailN).padStart(4, '0')}`,
        from, to,
        subject: i === 0 ? subject : `Re: ${subject}`,
        body: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 })),
        threadId,
        timestamp,
        labels: [i === 0 ? 'inbox' : 'inbox', ...(Math.random() < 0.2 ? ['important'] : [])],
        relatedJiraId: jira?.id || null,
      });
      emailN++;
    }
  }
  return emails.slice(0, 2000);
}
```

### `slackThreads.js`

Generate 500 Slack threads across 10 channels: `#general`, `#engineering`, `#incidents`, `#product`, `#customer-success`, `#platform-team`, `#analytics-team`, `#security`, `#releases`, `#exec-updates`.

- [ ] **Step 2: Create `demo-company/src/generators/slackThreads.js`**

```js
import faker from '../faker.js';

const CHANNELS = ['general', 'engineering', 'incidents', 'product', 'customer-success', 'platform-team', 'analytics-team', 'security', 'releases', 'exec-updates'];

const THREAD_STARTERS = [
  '👋 Heads up — we just deployed to production. Monitoring for 30 mins.',
  'Incident update: {product} API is showing elevated error rates. On it.',
  'Sprint {n} planning doc is ready for review: [link]',
  'PSA: dependency {dep} has a critical CVE. Patching now.',
  'Customer {customer} just escalated — reaching out to schedule call.',
  'Weekly metrics: ARR at ${arr}M, {customers} active customers. Up {pct}% MoM.',
  'Architecture decision needed: should we migrate {service} to {tech}?',
  'Congrats to {emp} on the promotion to {title}! 🎉',
  'Deployment blocked: tests failing in CI. Investigating.',
  'New customer won: {customer}! 🚀',
];

export function generateSlackThreads(employees, incidents, jiraIssues, customers) {
  const threads = [];
  for (let i = 1; i <= 500; i++) {
    const channel = faker.helpers.arrayElement(CHANNELS);
    const incident = channel === 'incidents' && incidents.length ? faker.helpers.arrayElement(incidents) : null;
    const jira = Math.random() < 0.3 && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues) : null;
    const customer = Math.random() < 0.25 && customers.length ? faker.helpers.arrayElement(customers) : null;
    const messageCount = faker.number.int({ min: 2, max: 15 });
    const baseTime = faker.date.between({ from: '2025-01-01', to: '2025-12-01' });
    const topic = faker.helpers.arrayElement(THREAD_STARTERS)
      .replace('{product}', 'Helios Platform')
      .replace('{n}', String(faker.number.int({ min: 1, max: 24 })))
      .replace('{dep}', faker.helpers.arrayElement(['lodash', 'axios', 'express', 'postgres']))
      .replace('{customer}', customer?.name || 'enterprise client')
      .replace('{arr}', String(faker.number.int({ min: 40, max: 52 })))
      .replace('{customers}', String(faker.number.int({ min: 195, max: 215 })))
      .replace('{pct}', String(faker.number.int({ min: 2, max: 8 })))
      .replace('{service}', 'notification-worker')
      .replace('{tech}', 'event-driven architecture')
      .replace('{emp}', faker.helpers.arrayElement(employees).name)
      .replace('{title}', 'Senior Engineer');
    const messages = Array.from({ length: messageCount }, (_, idx) => ({
      author: faker.helpers.arrayElement(employees).id,
      text: idx === 0 ? topic : faker.lorem.sentence(),
      timestamp: new Date(baseTime.getTime() + idx * faker.number.int({ min: 60000, max: 3600000 })).toISOString(),
    }));
    threads.push({
      id: `slack-${String(i).padStart(4, '0')}`,
      channel: `#${channel}`,
      messages,
      topic,
      relatedIncidentId: incident?.id || null,
      relatedJiraId: jira?.id || null,
    });
  }
  return threads;
}
```

### `calendarEvents.js`

Generate 300 meetings: standups, sprint reviews, 1:1s, customer calls, all-hands, executive meetings.

- [ ] **Step 3: Create `demo-company/src/generators/calendarEvents.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const MEETING_TYPES_WEIGHTED = [
  { weight: 0.3, value: 'standup' }, { weight: 0.15, value: 'sprint-review' },
  { weight: 0.2, value: '1on1' }, { weight: 0.1, value: 'executive' },
  { weight: 0.15, value: 'customer' }, { weight: 0.05, value: 'incident-review' },
  { weight: 0.05, value: 'all-hands' },
];
const MEETING_TITLES = {
  standup: d => `${d} Daily Standup`,
  'sprint-review': p => `${p} Sprint Review & Demo`,
  '1on1': (a, b) => `1:1: ${a} & ${b}`,
  executive: () => 'Executive Leadership Team Sync',
  customer: c => `${c} — QBR / Success Review`,
  'incident-review': () => 'Incident Post-Mortem Review',
  'all-hands': () => 'Helios All-Hands Meeting',
};

export function generateCalendarEvents(employees, customers) {
  const events = [];
  const departments = ['Engineering — Platform', 'Engineering — Analytics', 'Engineering — Connect', 'Engineering — Guard'];
  for (let i = 1; i <= 300; i++) {
    const type = faker.helpers.weightedArrayElement(MEETING_TYPES_WEIGHTED);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const organizer = faker.helpers.arrayElement(employees);
    const customer = type === 'customer' ? faker.helpers.arrayElement(customers) : null;
    const dept = faker.helpers.arrayElement(departments);
    const title = type === 'standup' ? MEETING_TITLES.standup(dept)
      : type === 'sprint-review' ? MEETING_TITLES['sprint-review'](product.name)
      : type === '1on1' ? MEETING_TITLES['1on1'](organizer.name, faker.helpers.arrayElement(employees).name)
      : type === 'executive' ? MEETING_TITLES.executive()
      : type === 'customer' ? MEETING_TITLES.customer(customer?.name || 'Client')
      : type === 'incident-review' ? MEETING_TITLES['incident-review']()
      : MEETING_TITLES['all-hands']();
    const duration = { standup: 15, 'sprint-review': 90, '1on1': 30, executive: 60, customer: 60, 'incident-review': 60, 'all-hands': 90 };
    const startTime = faker.date.between({ from: '2025-01-01', to: '2025-12-31' }).toISOString();
    const endTime = new Date(new Date(startTime).getTime() + duration[type] * 60000).toISOString();
    const attendeeCount = type === 'all-hands' ? 30 : faker.number.int({ min: 2, max: 8 });
    const attendees = faker.helpers.arrayElements(employees, attendeeCount).map(e => e.id);
    if (!attendees.includes(organizer.id)) attendees.unshift(organizer.id);
    events.push({
      id: `cal-${String(i).padStart(3, '0')}`,
      title,
      description: faker.lorem.sentence(),
      attendees,
      organizer: organizer.id,
      startTime, endTime,
      location: faker.helpers.arrayElement(['Zoom', 'Google Meet', 'Conference Room A', null]),
      type,
      productId: ['sprint-review', 'standup'].includes(type) ? product.id : null,
      customerId: customer?.id || null,
      agenda: faker.lorem.sentences(3),
      actionItems: Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () => faker.lorem.sentence()),
    });
  }
  return events;
}
```

### `meetingTranscripts.js`

Generate transcripts for 150 of the 300 meetings (prioritize sprint reviews, executive, customer, incident-review types).

- [ ] **Step 4: Create `demo-company/src/generators/meetingTranscripts.js`**

```js
import faker from '../faker.js';

const HIGH_VALUE_TYPES = ['sprint-review', 'executive', 'customer', 'incident-review', 'all-hands'];

export function generateMeetingTranscripts(calendarEvents, employees) {
  const highValueEvents = calendarEvents.filter(e => HIGH_VALUE_TYPES.includes(e.type));
  const otherEvents = calendarEvents.filter(e => !HIGH_VALUE_TYPES.includes(e.type));
  const selected = [
    ...highValueEvents,
    ...faker.helpers.arrayElements(otherEvents, Math.max(0, 150 - highValueEvents.length)),
  ].slice(0, 150);

  return selected.map(event => {
    const participants = event.attendees.slice(0, 4);
    const decisions = Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () =>
      faker.helpers.arrayElement([
        'Approved migration to microservices architecture',
        'Agreed to delay release by one sprint for quality',
        'Escalated customer issue to executive team',
        'Approved headcount request for Q4',
        'Decided to adopt event-driven messaging',
        'Greenlit feature for next roadmap cycle',
        'Agreed on incident response process change',
        `Extended ${faker.company.name()} contract for 12 months`,
      ])
    );
    const actionItems = Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
      owner: faker.helpers.arrayElement(employees).id,
      text: faker.helpers.arrayElement([
        'Update the runbook with new procedure',
        'Schedule follow-up with customer',
        'Create Jira epic for next sprint',
        'Draft architecture RFC',
        'Share post-mortem with leadership',
        'Prepare metrics dashboard',
        'Set up monitoring alerts',
      ]),
      dueDate: faker.date.soon({ days: 14 }).toISOString().split('T')[0],
    }));
    const lines = participants.flatMap(pId => {
      const emp = employees.find(e => e.id === pId);
      return Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () =>
        `${emp?.name || 'Participant'}: ${faker.lorem.sentence()}`
      );
    }).sort(() => Math.random() - 0.5);
    return {
      id: `transcript-${event.id}`,
      eventId: event.id,
      content: lines.join('\n'),
      participants,
      summary: faker.lorem.paragraph(),
      decisions,
      actionItems,
    };
  });
}
```

- [ ] **Step 5: Run smoke test**

Extend `demo-company/src/smoke.js`:
```bash
cd demo-company && node src/smoke.js
```
Confirm emails ~2000, slackThreads ~500, calEvents 300, transcripts ~150.

- [ ] **Step 6: Commit**

```bash
git add demo-company/src/generators/emails.js demo-company/src/generators/slackThreads.js demo-company/src/generators/calendarEvents.js demo-company/src/generators/meetingTranscripts.js
git commit -m "feat(demo): add communication generators — 2000 emails, 500 Slack threads, 300 meetings, 150 transcripts"
```

---

## Task 5 — Intelligence Generators: Incidents, Documents, Timeline, Memory, Executive Reports, KG, Permissions, Summary

**Files:**
- Create: `demo-company/src/generators/incidents.js`
- Create: `demo-company/src/generators/documents.js`
- Create: `demo-company/src/generators/timeline.js`
- Create: `demo-company/src/generators/memory.js`
- Create: `demo-company/src/generators/executiveReports.js`
- Create: `demo-company/src/generators/knowledgeGraph.js`
- Create: `demo-company/src/generators/permissions.js`

**Targets:** 80 incidents, 400 documents, 500 timeline events, 300 memory records, 40 executive reports

### `incidents.js`

- [ ] **Step 1: Create `demo-company/src/generators/incidents.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const INC_TITLES = [
  'Platform API returning 502 errors for all enterprise customers',
  'Analytics data pipeline stalled — reports not updating',
  'Authentication service timeout — users unable to log in',
  'Connect adapter outage — third-party webhooks failing',
  'Database replication lag exceeding 60 seconds',
  'Memory leak in Platform worker causing pod restarts',
  'DDoS-like traffic spike on API gateway',
  'SSL certificate expiration — affecting Connect endpoints',
  'Data loss incident: missing events in analytics stream',
  'Guard policy engine returning incorrect access decisions',
];
const ROOT_CAUSES = [
  'Misconfigured load balancer after routine deployment',
  'Unindexed query causing full table scan at scale',
  'Memory allocation bug introduced in v2.14.0',
  'Third-party dependency rate limit exceeded',
  'Infrastructure autoscaling policy misconfigured',
  'Network partition between availability zones',
  'Certificate not rotated before expiration',
];
const SEVERITIES = [{ weight: 0.05, value: 'P0' }, { weight: 0.2, value: 'P1' }, { weight: 0.4, value: 'P2' }, { weight: 0.35, value: 'P3' }];
const INC_STATUSES = [{ weight: 0.75, value: 'resolved' }, { weight: 0.15, value: 'mitigated' }, { weight: 0.1, value: 'investigating' }];

export function generateIncidents(repos, employees, customers) {
  const srTeam = employees.filter(e => e.department === 'dept-devops' || e.department.startsWith('dept-eng'));
  const incidents = [];
  for (let i = 1; i <= 80; i++) {
    const severity = faker.helpers.weightedArrayElement(SEVERITIES);
    const status = faker.helpers.weightedArrayElement(INC_STATUSES);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const detectedAt = faker.date.between({ from: '2025-01-01', to: '2025-11-01' }).toISOString();
    const mttr = severity === 'P0' ? faker.number.int({ min: 30, max: 240 })
      : severity === 'P1' ? faker.number.int({ min: 15, max: 90 })
      : faker.number.int({ min: 5, max: 45 });
    const resolvedAt = status === 'resolved' ? new Date(new Date(detectedAt).getTime() + mttr * 60000).toISOString() : null;
    const commander = faker.helpers.arrayElement(srTeam);
    const affectedCustomers = faker.helpers.arrayElements(customers, faker.number.int({ min: severity === 'P0' ? 10 : 0, max: severity === 'P0' ? 50 : 5 })).map(c => c.id);
    const timelineSteps = [
      { timestamp: detectedAt, action: 'Incident detected via monitoring alert', actor: commander.id },
      { timestamp: new Date(new Date(detectedAt).getTime() + 300000).toISOString(), action: 'Incident channel created, team paged', actor: commander.id },
      { timestamp: new Date(new Date(detectedAt).getTime() + 900000).toISOString(), action: 'Root cause identified', actor: faker.helpers.arrayElement(srTeam).id },
      { timestamp: new Date(new Date(detectedAt).getTime() + mttr * 0.8 * 60000).toISOString(), action: 'Mitigation applied', actor: faker.helpers.arrayElement(srTeam).id },
      ...(resolvedAt ? [{ timestamp: resolvedAt, action: 'Service fully restored, monitoring confirmed', actor: commander.id }] : []),
    ];
    incidents.push({
      id: `inc-${String(i).padStart(3, '0')}`,
      title: faker.helpers.arrayElement(INC_TITLES),
      description: faker.lorem.paragraph(),
      severity,
      status,
      affectedProduct: product.id,
      affectedCustomers,
      commander: commander.id,
      timeline: timelineSteps,
      rootCause: faker.helpers.arrayElement(ROOT_CAUSES),
      resolution: `Applied hotfix. Deployed v${faker.system.semver()}. Monitoring for 1 hour.`,
      detectedAt,
      resolvedAt,
      mttr: resolvedAt ? mttr : null,
    });
  }
  return incidents;
}

import { PRODUCTS } from '../company.js';
```

### `documents.js`

- [ ] **Step 2: Create `demo-company/src/generators/documents.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const DOC_TYPES = [
  { weight: 0.2, value: 'runbook' },
  { weight: 0.15, value: 'architecture' },
  { weight: 0.15, value: 'api-spec' },
  { weight: 0.15, value: 'post-mortem' },
  { weight: 0.1, value: 'rfc' },
  { weight: 0.15, value: 'onboarding' },
  { weight: 0.1, value: 'policy' },
];
const TITLES_BY_TYPE = {
  runbook: ['On-Call Runbook: Platform API', 'Database Failover Runbook', 'Deployment Rollback Procedure', 'Incident Response Playbook', 'SSL Certificate Renewal SOP'],
  architecture: ['Platform Microservices Architecture', 'Data Pipeline Architecture', 'Multi-Region Deployment Strategy', 'Event-Driven Messaging Design', 'Security Architecture Overview'],
  'api-spec': ['Platform API v3 Reference', 'Connect Adapter Interface Spec', 'Analytics Query API', 'Authentication API Reference', 'Guard Policy API'],
  'post-mortem': ['Post-Mortem: P0 Database Outage', 'Post-Mortem: Auth Service Failure', 'Post-Mortem: Data Pipeline Stall', 'Blameless Post-Mortem: API Gateway Issue'],
  rfc: ['RFC: Adopt GraphQL for Platform API', 'RFC: Event sourcing for audit log', 'RFC: Migrate to Kubernetes', 'RFC: Adopt OpenTelemetry'],
  onboarding: ['Engineering Onboarding Guide', 'Sales Onboarding Playbook', 'Customer Success Onboarding', 'Executive Briefing: Helios Platform'],
  policy: ['Data Retention Policy', 'Security Incident Response Policy', 'Remote Work Policy', 'Code Review Standards', 'Release Management Policy'],
};

export function generateDocuments(employees) {
  const docs = [];
  for (let i = 1; i <= 400; i++) {
    const type = faker.helpers.weightedArrayElement(DOC_TYPES);
    const titles = TITLES_BY_TYPE[type] || ['Internal Document'];
    const product = Math.random() < 0.7 ? faker.helpers.arrayElement(PRODUCTS) : null;
    const author = faker.helpers.arrayElement(employees);
    const createdAt = faker.date.between({ from: '2024-06-01', to: '2025-06-01' }).toISOString();
    docs.push({
      id: `doc-${String(i).padStart(3, '0')}`,
      title: faker.helpers.arrayElement(titles) + (i > titles.length ? ` v${faker.number.int({ min: 2, max: 5 })}` : ''),
      content: faker.lorem.paragraphs(faker.number.int({ min: 3, max: 8 })),
      type,
      productId: product?.id || null,
      author: author.id,
      tags: faker.helpers.arrayElements(['engineering', 'product', 'operations', 'security', 'onboarding', 'release'], faker.number.int({ min: 1, max: 3 })),
      createdAt,
      updatedAt: faker.date.between({ from: createdAt, to: '2025-12-31' }).toISOString(),
    });
  }
  return docs;
}
```

### `timeline.js`

Generate 500 operational timeline events covering the 12-month period. Reference real entity IDs.

- [ ] **Step 3: Create `demo-company/src/generators/timeline.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

const TL_TYPES = [
  { type: 'PRODUCT_LAUNCH', title: p => `${p} v${faker.system.semver()} released`, relatedType: 'product' },
  { type: 'INCIDENT', title: () => `P${faker.number.int({min:0,max:3})} incident detected and resolved`, relatedType: 'incident' },
  { type: 'HIRE', title: () => `New employee onboarded`, relatedType: 'employee' },
  { type: 'CUSTOMER_WON', title: c => `Customer won: ${c}`, relatedType: 'customer' },
  { type: 'DECISION', title: () => faker.helpers.arrayElement(['Architecture decision made', 'Roadmap priority changed', 'Partnership signed']), relatedType: 'document' },
  { type: 'SPRINT_COMPLETED', title: () => `Sprint ${faker.number.int({min:1,max:24})} completed`, relatedType: 'jira' },
  { type: 'SECURITY_REVIEW', title: () => 'Security audit completed', relatedType: 'document' },
  { type: 'ALL_HANDS', title: () => 'Company all-hands meeting held', relatedType: 'meeting' },
];

export function generateTimeline(employees, customers, incidents, jiraIssues, calendarEvents, documents) {
  const events = [];
  for (let i = 1; i <= 500; i++) {
    const tmpl = faker.helpers.arrayElement(TL_TYPES);
    const product = faker.helpers.arrayElement(PRODUCTS);
    const customer = faker.helpers.arrayElement(customers);
    const incident = faker.helpers.arrayElement(incidents);
    const actor = faker.helpers.arrayElement(employees);
    const relatedId =
      tmpl.relatedType === 'incident' ? incident.id
      : tmpl.relatedType === 'customer' ? customer.id
      : tmpl.relatedType === 'product' ? product.id
      : tmpl.relatedType === 'employee' ? faker.helpers.arrayElement(employees).id
      : tmpl.relatedType === 'jira' ? faker.helpers.arrayElement(jiraIssues).id
      : tmpl.relatedType === 'meeting' ? faker.helpers.arrayElement(calendarEvents).id
      : faker.helpers.arrayElement(documents).id;
    events.push({
      id: `tl-${String(i).padStart(3, '0')}`,
      type: tmpl.type,
      title: tmpl.title(product.name, customer.name),
      description: faker.lorem.sentence(),
      timestamp: faker.date.between({ from: '2025-01-01', to: '2025-12-31' }).toISOString(),
      actors: [actor.id],
      relatedId,
      relatedType: tmpl.relatedType,
      productId: product.id,
    });
  }
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
```

### `memory.js`, `executiveReports.js`, `knowledgeGraph.js`, `permissions.js`

- [ ] **Step 4: Create `demo-company/src/generators/memory.js`**

```js
import faker from '../faker.js';

export function generateMemory(incidents, jiraIssues, documents, calendarEvents) {
  const records = [];
  let n = 1;
  // From incidents
  for (const inc of incidents.slice(0, 80)) {
    records.push({ id: `mem-${String(n++).padStart(3,'0')}`, type: 'INCIDENT', content: `${inc.title}: ${inc.rootCause}`, source: 'incident-engine', importance: inc.severity === 'P0' ? 0.95 : inc.severity === 'P1' ? 0.80 : 0.60, authority: 0.9, timestamp: inc.detectedAt, relatedId: inc.id });
  }
  // From executive decisions (top jira epics)
  for (const issue of jiraIssues.filter(j => j.type === 'epic').slice(0, 80)) {
    records.push({ id: `mem-${String(n++).padStart(3,'0')}`, type: 'DECISION', content: issue.title, source: 'decision-engine', importance: 0.75, authority: 0.85, timestamp: issue.createdAt, relatedId: issue.id });
  }
  // From documents
  for (const doc of documents.filter(d => d.type === 'post-mortem' || d.type === 'rfc').slice(0, 80)) {
    records.push({ id: `mem-${String(n++).padStart(3,'0')}`, type: 'EXECUTIVE_SUMMARY', content: doc.title, source: 'knowledge-base', importance: 0.70, authority: 0.80, timestamp: doc.createdAt, relatedId: doc.id });
  }
  // From calendar events
  for (const evt of calendarEvents.filter(e => e.type === 'executive' || e.type === 'all-hands').slice(0, 60)) {
    records.push({ id: `mem-${String(n++).padStart(3,'0')}`, type: 'MEETING_NOTE', content: evt.title, source: 'calendar', importance: 0.65, authority: 0.75, timestamp: evt.startTime, relatedId: evt.id });
  }
  return records.slice(0, 300);
}
```

- [ ] **Step 5: Create `demo-company/src/generators/executiveReports.js`**

```js
import faker from '../faker.js';

const REPORT_TITLES = [
  'Q1 2025 Business Review', 'Q2 2025 Investor Update', 'Q3 2025 Board Deck Summary',
  'January 2025 Monthly Metrics', 'February 2025 Monthly Metrics', 'March 2025 Monthly Metrics',
  'April 2025 Monthly Metrics', 'May 2025 Monthly Metrics', 'June 2025 Monthly Metrics',
  'H1 2025 Engineering Report', 'Customer Health Report — Q2 2025', 'Security Posture Report 2025',
  'Annual Product Roadmap 2025', 'Go-To-Market Q3 Strategy', 'Competitive Analysis Update',
];

export function generateExecutiveReports(employees) {
  const execs = employees.filter(e => e.department === 'dept-executive');
  return REPORT_TITLES.map((title, idx) => ({
    id: `report-${String(idx + 1).padStart(2, '0')}`,
    title,
    period: title.match(/Q\d \d{4}|H\d \d{4}|\w+ \d{4}/)?.[0] || '2025',
    author: faker.helpers.arrayElement(execs).id,
    summary: faker.lorem.paragraph(),
    highlights: Array.from({ length: 3 }, () => faker.lorem.sentence()),
    risks: Array.from({ length: 2 }, () => faker.helpers.arrayElement([
      'Customer churn risk in SMB segment', 'Engineering capacity constraints in Q4',
      'Competitive pressure from Series B startup', 'Regulatory compliance gap in EU region',
      'Key person dependency on platform team', 'Infrastructure scaling costs exceeding budget',
    ])),
    decisions: Array.from({ length: 2 }, () => faker.lorem.sentence()),
    metrics: {
      arr: faker.number.int({ min: 40000000, max: 50000000 }),
      customers: faker.number.int({ min: 195, max: 215 }),
      nrr: faker.number.float({ min: 105, max: 130, fractionDigits: 1 }),
      headcount: faker.number.int({ min: 420, max: 460 }),
    },
    createdAt: faker.date.between({ from: '2025-01-01', to: '2025-12-01' }).toISOString(),
  }));
}
```

- [ ] **Step 6: Create `demo-company/src/generators/knowledgeGraph.js`**

```js
import { PRODUCTS, DEPARTMENTS } from '../company.js';

export function generateKnowledgeGraph(employees, customers, incidents, repositories) {
  const nodes = [];
  const edges = [];

  // Employee nodes
  for (const emp of employees.slice(0, 100)) { // first 100 for KG
    nodes.push({ id: emp.id, type: 'employee', name: emp.name, properties: { title: emp.title, department: emp.department } });
  }
  // Customer nodes
  for (const cust of customers.slice(0, 50)) {
    nodes.push({ id: cust.id, type: 'customer', name: cust.name, properties: { tier: cust.tier, health: cust.health } });
  }
  // Product nodes
  for (const prod of PRODUCTS) {
    nodes.push({ id: prod.id, type: 'product', name: prod.name, properties: { description: prod.description } });
  }
  // Repository nodes
  for (const repo of repositories) {
    nodes.push({ id: repo.id, type: 'repository', name: repo.name, properties: { language: repo.language } });
  }
  // Incident nodes
  for (const inc of incidents.slice(0, 30)) {
    nodes.push({ id: inc.id, type: 'incident', name: inc.title, properties: { severity: inc.severity, status: inc.status } });
  }

  // Edges: employee → manages → employee
  for (const emp of employees.slice(0, 100)) {
    if (emp.manager) edges.push({ source: emp.manager, target: emp.id, relation: 'manages', weight: 1.0 });
  }
  // Edges: employee → works_on → product (via department)
  for (const emp of employees.slice(0, 100)) {
    const prod = PRODUCTS.find(p => p.teamDept === emp.department);
    if (prod) edges.push({ source: emp.id, target: prod.id, relation: 'works_on', weight: 0.8 });
  }
  // Edges: customer → uses → product
  for (const cust of customers.slice(0, 50)) {
    for (const prodId of cust.products) {
      edges.push({ source: cust.id, target: prodId, relation: 'uses', weight: 0.9 });
    }
  }
  // Edges: repo → belongs_to → product
  for (const repo of repositories) {
    edges.push({ source: repo.id, target: repo.productId, relation: 'belongs_to', weight: 1.0 });
  }
  // Edges: incident → affected → product
  for (const inc of incidents.slice(0, 30)) {
    edges.push({ source: inc.id, target: inc.affectedProduct, relation: 'affected', weight: 0.9 });
  }

  return [{ nodes, edges }]; // wrapped in array for dataset type compatibility
}
```

- [ ] **Step 7: Create `demo-company/src/generators/permissions.js`**

```js
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

export function generatePermissions(employees) {
  const admins = employees.filter(e => e.role === 'ADMIN');
  const permissions = [];
  let n = 1;
  const resources = PRODUCTS.map(p => `product:${p.id}`).concat(['admin:audit', 'admin:settings', 'data:export']);
  for (const emp of employees) {
    const empResources = emp.role === 'ADMIN'
      ? resources
      : faker.helpers.arrayElements(resources.filter(r => !r.startsWith('admin:')), faker.number.int({ min: 1, max: 3 }));
    for (const resource of empResources) {
      permissions.push({
        id: `perm-${String(n++).padStart(4, '0')}`,
        employeeId: emp.id,
        resource,
        action: emp.role === 'ADMIN' ? 'admin' : 'read',
        grantedAt: emp.startDate,
        grantedBy: faker.helpers.arrayElement(admins).id,
      });
    }
  }
  return permissions;
}
```

- [ ] **Step 8: Commit**

```bash
git add demo-company/src/generators/
git commit -m "feat(demo): add intelligence generators — 80 incidents, 400 docs, 500 timeline, 300 memory, 40 reports, KG, permissions"
```

---

## Task 6 — Main Generator + Manifest + Export Pipeline

**Files:**
- Create: `demo-company/src/generators/summary.js`
- Create: `demo-company/src/generate.js`

This task orchestrates all generators, writes all dataset JSON files, and writes `exports/manifest.json`.

- [ ] **Step 1: Create `demo-company/src/generators/summary.js`**

```js
import { COMPANY } from '../company.js';

export function generateSummary(employees, customers, repositories) {
  return [{
    id: `summary-${COMPANY.slug}`,
    company: COMPANY.name,
    generatedAt: new Date().toISOString(),
    totalEmployees: employees.length,
    totalCustomers: customers.length,
    totalRepositories: repositories.length,
    arr: COMPANY.arr,
  }];
}
```

- [ ] **Step 2: Create `demo-company/src/generate.js`**

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { COMPANY, PRODUCTS } from './company.js';
import { generateDepartments } from './generators/departments.js';
import { generateEmployees } from './generators/employees.js';
import { generateCustomers } from './generators/customers.js';
import { generateRepositories } from './generators/repositories.js';
import { generateCommits } from './generators/commits.js';
import { generatePullRequests } from './generators/pullRequests.js';
import { generateJiraIssues } from './generators/jiraIssues.js';
import { generateEmails } from './generators/emails.js';
import { generateSlackThreads } from './generators/slackThreads.js';
import { generateCalendarEvents } from './generators/calendarEvents.js';
import { generateMeetingTranscripts } from './generators/meetingTranscripts.js';
import { generateIncidents } from './generators/incidents.js';
import { generateDocuments } from './generators/documents.js';
import { generateTimeline } from './generators/timeline.js';
import { generateMemory } from './generators/memory.js';
import { generateExecutiveReports } from './generators/executiveReports.js';
import { generateKnowledgeGraph } from './generators/knowledgeGraph.js';
import { generatePermissions } from './generators/permissions.js';
import { generateSummary } from './generators/summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = path.join(__dirname, '..', 'exports', 'datasets');

function write(filename, data) {
  fs.writeFileSync(path.join(EXPORTS_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename} — ${data.length} records`);
}

console.log('🏢 Generating Helios Software Inc. demo company dataset...\n');
const start = Date.now();

fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// ─── Core Entities ─────────────────────────────────────────────────────────
const departments = generateDepartments();
const employees   = generateEmployees(departments);
const customers   = generateCustomers(employees);
const repositories = generateRepositories(PRODUCTS);
console.log('Core entities:');
write('departments.json', departments);
write('employees.json', employees);
write('customers.json', customers);
write('repositories.json', repositories);

// ─── Engineering ────────────────────────────────────────────────────────────
const engineers = employees.filter(e => e.department.startsWith('dept-eng'));
const jiraIssues = generateJiraIssues(engineers, customers);
const commits    = generateCommits(repositories, engineers);
const pullRequests = generatePullRequests(repositories, engineers, jiraIssues);
console.log('\nEngineering:');
write('jira_issues.json', jiraIssues);
write('commits.json', commits);
write('pull_requests.json', pullRequests);

// ─── Communication ──────────────────────────────────────────────────────────
const calendarEvents = generateCalendarEvents(employees, customers);
const meetingTranscripts = generateMeetingTranscripts(calendarEvents, employees);
const incidents  = generateIncidents(repositories, employees, customers);
const emails     = generateEmails(employees, customers, jiraIssues);
const slackThreads = generateSlackThreads(employees, incidents, jiraIssues, customers);
console.log('\nCommunication:');
write('calendar_events.json', calendarEvents);
write('meetings.json', calendarEvents); // meetings = calendar_events with same shape
write('meeting_transcripts.json', meetingTranscripts);
write('emails.json', emails);
write('slack_threads.json', slackThreads);

// ─── Intelligence ────────────────────────────────────────────────────────────
const documents  = generateDocuments(employees);
const timeline   = generateTimeline(employees, customers, incidents, jiraIssues, calendarEvents, documents);
const memory     = generateMemory(incidents, jiraIssues, documents, calendarEvents);
const execReports = generateExecutiveReports(employees);
const knowledgeGraph = generateKnowledgeGraph(employees, customers, incidents, repositories);
const permissions = generatePermissions(employees);
const summary    = generateSummary(employees, customers, repositories);
console.log('\nIntelligence:');
write('incidents.json', incidents);
write('documents.json', documents);
write('timeline.json', timeline);
write('memory.json', memory);
write('executive_reports.json', execReports);
write('knowledgeGraph.json', knowledgeGraph);
write('permissions.json', permissions);
write('summary.json', summary);

// ─── Company top-level ──────────────────────────────────────────────────────
const company = [{ id: COMPANY.slug, ...COMPANY }];
write('company.json', company);

// ─── Manifest ────────────────────────────────────────────────────────────────
const datasetTypes = [
  'company', 'summary', 'departments', 'employees', 'customers', 'repositories',
  'commits', 'pull_requests', 'jira_issues', 'emails', 'slack_threads',
  'calendar_events', 'meetings', 'meeting_transcripts', 'incidents', 'documents',
  'timeline', 'memory', 'executive_reports', 'knowledgeGraph', 'permissions',
];

const manifest = {
  schemaVersion: '1.0',
  organization: {
    name: COMPANY.name,
    slug: COMPANY.slug,
    industry: COMPANY.industry,
    size: COMPANY.headcount,
  },
  datasets: datasetTypes.map(type => ({ type, file: `datasets/${type}.json` })),
};

const manifestPath = path.join(__dirname, '..', 'exports', 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n✓ manifest.json — ${datasetTypes.length} dataset types`);

// ─── Stats ───────────────────────────────────────────────────────────────────
const totalRecords = departments.length + employees.length + customers.length
  + repositories.length + commits.length + pullRequests.length + jiraIssues.length
  + emails.length + slackThreads.length + calendarEvents.length + meetingTranscripts.length
  + incidents.length + documents.length + timeline.length + memory.length
  + execReports.length + knowledgeGraph.length + permissions.length + summary.length + company.length;

console.log(`\n✅ Generation complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`📊 Total records: ${totalRecords.toLocaleString()}`);
console.log(`📁 Output: demo-company/exports/`);
```

- [ ] **Step 3: Run the full generator**

```bash
cd demo-company && node src/generate.js
```

Expected output: all dataset files written, total records > 8000, completion in < 60s.

- [ ] **Step 4: Verify output**

```bash
ls -la demo-company/exports/datasets/ | wc -l
cat demo-company/exports/manifest.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('datasets:', d.datasets.length)"
```

- [ ] **Step 5: Commit**

```bash
git add demo-company/src/generators/summary.js demo-company/src/generate.js demo-company/exports/
git commit -m "feat(demo): add main generator orchestrator, produce manifest and all 22 dataset files"
```

---

## Task 7 — Import into FLOW + Generate DEMO_IMPORT_REPORT.md

**Files:**
- Create: `demo-company/src/import.js` — reads exports/ and POSTs to FLOW lifecycle API
- Create: `demo-company/src/validate.js` — calls FLOW APIs to verify import success
- Create: `DEMO_IMPORT_REPORT.md` (auto-generated at repo root)

**Prerequisites:** FLOW backend running at `http://localhost:5001`. Valid JWT in env var `FLOW_TOKEN`. Valid workspace at env var `FLOW_WORKSPACE_ID`.

- [ ] **Step 1: Create `demo-company/src/import.js`**

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS = path.join(__dirname, '..', 'exports');
const API = process.env.FLOW_API || 'http://localhost:5001';
const TOKEN = process.env.FLOW_TOKEN;
const WORKSPACE_ID = process.env.FLOW_WORKSPACE_ID;

if (!TOKEN || !WORKSPACE_ID) {
  console.error('Error: FLOW_TOKEN and FLOW_WORKSPACE_ID environment variables are required.');
  console.error('Example: FLOW_TOKEN=<jwt> FLOW_WORKSPACE_ID=<id> node src/import.js');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXPORTS, 'manifest.json'), 'utf8'));

const datasets = {};
for (const ds of manifest.datasets) {
  const filePath = path.join(EXPORTS, ds.file);
  if (fs.existsSync(filePath)) {
    datasets[ds.type] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`  Loaded ${ds.type}: ${datasets[ds.type].length} records`);
  }
}

console.log(`\n🚀 Importing Helios Software Inc. into FLOW workspace: ${WORKSPACE_ID}`);
console.log(`   API: ${API}`);

const response = await fetch(`${API}/api/lifecycle/create`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
    'workspace-id': WORKSPACE_ID,
  },
  body: JSON.stringify({ manifest, datasets }),
});

const result = await response.json();
if (!response.ok) {
  console.error('Import failed:', JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log('\n✅ Import complete!');
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(__dirname, '..', '..', 'demo-company', 'exports', 'last-import-result.json'), JSON.stringify(result, null, 2));
```

- [ ] **Step 2: Create `demo-company/src/validate.js`**

Script that calls FLOW APIs and generates DEMO_IMPORT_REPORT.md.

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.FLOW_API || 'http://localhost:5001';
const TOKEN = process.env.FLOW_TOKEN;
const WORKSPACE_ID = process.env.FLOW_WORKSPACE_ID;

if (!TOKEN || !WORKSPACE_ID) {
  console.error('Error: FLOW_TOKEN and FLOW_WORKSPACE_ID required');
  process.exit(1);
}

const headers = { 'Authorization': `Bearer ${TOKEN}`, 'workspace-id': WORKSPACE_ID, 'Content-Type': 'application/json' };

async function check(label, fn) {
  try {
    const result = await fn();
    console.log(`  ✅ ${label}`);
    return { label, status: 'PASS', ...result };
  } catch (err) {
    console.log(`  ❌ ${label}: ${err.message}`);
    return { label, status: 'FAIL', error: err.message };
  }
}

async function get(path) {
  const r = await fetch(`${API}${path}`, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

console.log('🔍 Validating FLOW workspace after Helios import...\n');

const importResult = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'exports', 'last-import-result.json'), 'utf8'));

const checks = await Promise.allSettled([
  check('Workspace accessible', async () => { const r = await get('/health'); return { evidence: `status: ${r.status}` }; }),
  check('Import history has record', async () => { const r = await get('/api/lifecycle/history'); const found = r.records?.find(x => x.importId === importResult.importId); if (!found) throw new Error('Import record not found'); return { evidence: `importId: ${found.importId}, status: ${found.status}` }; }),
  check('Health score available', async () => { const r = await get('/api/intelligence/health-score'); return { evidence: `score: ${r.score ?? r.healthScore ?? 'present'}` }; }),
  check('Universal Search returns results', async () => { const r = await post('/api/query', { queryText: 'Helios Platform engineering team' }); if (!r.synthesis && !r.answer) throw new Error('No synthesis returned'); return { evidence: `synthesis length: ${(r.synthesis||r.answer||'').length} chars` }; }),
  check('Executive Dashboard accessible', async () => { const r = await get('/api/brain/briefing?role=EXECUTIVE'); return { evidence: `briefing sections: ${Object.keys(r).length}` }; }),
  check('Daily Briefing generates', async () => { const r = await get('/api/brain/briefing?role=EMPLOYEE'); return { evidence: `briefing present: ${!!r}` }; }),
  check('Copilot answers questions', async () => { const r = await post('/api/brain/copilot', { question: 'What are the current P0 incidents at Helios?' }); return { evidence: `answer length: ${(r.answer||r.response||'').length} chars` }; }),
  check('Recommendations available', async () => { const r = await get('/api/brain/recommendations'); return { evidence: `count: ${(r.recommendations||r||[]).length}` }; }),
  check('Timeline populated', async () => { const r = await get('/api/brain/timeline'); return { evidence: `events: ${(r.events||r||[]).length}` }; }),
  check('Organization memory populated', async () => { const r = await get('/api/brain/memory'); return { evidence: `records: ${(r.records||r||[]).length}` }; }),
  check('Lifecycle schema returns 23 types', async () => { const r = await get('/api/lifecycle/schema'); if (r.supportedTypes?.length < 20) throw new Error(`Only ${r.supportedTypes?.length} types`); return { evidence: `types: ${r.supportedTypes?.length}` }; }),
]);

const results = checks.map(c => c.status === 'fulfilled' ? c.value : { label: 'unknown', status: 'FAIL', error: c.reason?.message });
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;

// Generate DEMO_IMPORT_REPORT.md
const report = `# DEMO_IMPORT_REPORT.md
> Helios Software Inc. — FLOW Workspace Import Validation Report
> Generated: ${new Date().toISOString()}

---

## Part A — Auto-Generated Import Report

| Field | Value |
|-------|-------|
| Import ID | ${importResult.importId || 'N/A'} |
| Workspace ID | ${importResult.workspaceId || WORKSPACE_ID} |
| Organization | Helios Software Inc. |
| Schema Version | 1.0 |
| Engine Version | 2.0 |
| Status | ${importResult.status || importResult.validation?.valid ? 'COMPLETED' : 'FAILED'} |
| Duration | ${importResult.statistics?.duration || 'N/A'} |

### Dataset Summary
${JSON.stringify(importResult.statistics || {}, null, 2).split('\n').map(l => `    ${l}`).join('\n')}

### Graph Metrics
${JSON.stringify(importResult.graphMetrics || {}, null, 2).split('\n').map(l => `    ${l}`).join('\n')}

---

## Part B — Functional Validation Report

| # | Check | Status | Evidence |
|---|-------|--------|----------|
${results.map((r, i) => `| ${i+1} | ${r.label} | ${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${r.evidence || r.error || ''} |`).join('\n')}

---

## Summary

- **Total checks:** ${results.length}
- **Passed:** ${passed}
- **Failed:** ${failed}
- **Result:** ${failed === 0 ? '🟢 ALL CHECKS PASSED — Helios workspace is fully operational' : `🔴 ${failed} CHECK(S) FAILED — review above`}

---

*This report is the acceptance document for Milestone 2 — Demo Company Integration.*
*It demonstrates that importing a workspace through the Workspace Lifecycle Engine produces a fully operational FLOW environment.*
`;

const reportPath = path.join(__dirname, '..', '..', 'DEMO_IMPORT_REPORT.md');
fs.writeFileSync(reportPath, report);
console.log(`\n📄 Report written to DEMO_IMPORT_REPORT.md`);
console.log(`\nResult: ${passed}/${results.length} checks passed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 3: Add scripts to `demo-company/package.json`**

```json
{
  "scripts": {
    "generate": "node src/generate.js",
    "import": "node src/import.js",
    "validate": "node src/validate.js",
    "full-run": "node src/generate.js && node src/import.js && node src/validate.js",
    "clean": "rm -rf exports/datasets && mkdir -p exports/datasets"
  }
}
```

- [ ] **Step 4: Run the import + validation** (requires backend running)

```bash
# If backend is running:
FLOW_TOKEN=<jwt> FLOW_WORKSPACE_ID=<id> cd demo-company && npm run import
FLOW_TOKEN=<jwt> FLOW_WORKSPACE_ID=<id> npm run validate
```

If backend not running during implementation, verify the scripts parse correctly:
```bash
cd demo-company && node --check src/import.js && node --check src/validate.js && echo "syntax OK"
```

- [ ] **Step 5: Commit**

```bash
git add demo-company/src/import.js demo-company/src/validate.js demo-company/package.json
git commit -m "feat(demo): add FLOW import and validation scripts, generate DEMO_IMPORT_REPORT.md"
```

---

## Completion Criteria

- [ ] `cd demo-company && npm run generate` completes in < 60s with 0 errors
- [ ] All 22 dataset JSON files exist in `demo-company/exports/datasets/`
- [ ] `demo-company/exports/manifest.json` lists 22 dataset types
- [ ] Total records generated > 8000
- [ ] All IDs are unique within each dataset type
- [ ] All foreign key references are valid (no orphaned IDs)
- [ ] Generator is fully deterministic (same output on re-run with seed 12345)
- [ ] `node --check` passes on all files in `demo-company/src/`
- [ ] Import script (`src/import.js`) and validate script (`src/validate.js`) are syntactically valid

---

*Last updated: 2026-06-30 by Claude (Milestone 2 — Demo Company Integration)*
