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
import { generateProjects } from './generators/projects.js';
import { generateSummary } from './generators/summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = path.join(__dirname, '..', 'exports', 'datasets');
fs.mkdirSync(EXPORTS_DIR, { recursive: true });

function write(filename, data) {
  fs.writeFileSync(path.join(EXPORTS_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`  ✓ ${filename} — ${Array.isArray(data) ? data.length : JSON.stringify(data).length} records`);
}

console.log('🏢 Generating Helios Software Inc. dataset...\n');
const start = Date.now();

const departments    = generateDepartments();
const employees      = generateEmployees(departments);
const customers      = generateCustomers(employees);
const repositories   = generateRepositories();
const engineers      = employees.filter(e => e.department.startsWith('dept-eng'));
const jiraIssues     = generateJiraIssues(engineers, customers);
const commits        = generateCommits(repositories, engineers);
const pullRequests   = generatePullRequests(repositories, engineers, jiraIssues);
const calendarEvents = generateCalendarEvents(employees, customers);
const incidents      = generateIncidents(employees, customers);
const meetingTranscripts = generateMeetingTranscripts(calendarEvents, employees);
const emails         = generateEmails(employees, customers, jiraIssues);
const slackThreads   = generateSlackThreads(employees, incidents, jiraIssues, customers);
const documents      = generateDocuments(employees);
const timeline       = generateTimeline(employees, customers, incidents, jiraIssues, calendarEvents, documents);
const memory         = generateMemory(incidents, jiraIssues, documents, calendarEvents);
const execReports    = generateExecutiveReports(employees);
const knowledgeGraph = generateKnowledgeGraph(employees, customers, incidents, repositories);
const permissions    = generatePermissions(employees);
const projects       = generateProjects();
const summary        = generateSummary(employees, customers, repositories);
const company        = [{ id: COMPANY.slug, ...COMPANY }];

console.log('Writing datasets:');
write('departments.json', departments);
write('employees.json', employees);
write('customers.json', customers);
write('repositories.json', repositories);
write('commits.json', commits);
write('pull_requests.json', pullRequests);
write('jira_issues.json', jiraIssues);
write('emails.json', emails);
write('slack_threads.json', slackThreads);
write('calendar_events.json', calendarEvents);
write('meetings.json', calendarEvents);
write('meeting_transcripts.json', meetingTranscripts);
write('incidents.json', incidents);
write('documents.json', documents);
write('timeline.json', timeline);
write('memory.json', memory);
write('executive_reports.json', execReports);
write('knowledgeGraph.json', knowledgeGraph);
write('permissions.json', permissions);
write('projects.json', projects);
write('summary.json', summary);
write('company.json', company);

const datasetTypes = ['company','summary','departments','employees','customers','repositories','projects','commits','pull_requests','jira_issues','emails','slack_threads','calendar_events','meetings','meeting_transcripts','incidents','documents','timeline','memory','executive_reports','knowledgeGraph','permissions'];
const manifest = {
  schemaVersion: '1.0',
  organization: { name: COMPANY.name, slug: COMPANY.slug, industry: COMPANY.industry, size: COMPANY.headcount },
  datasets: datasetTypes.map(type => ({ type, file: `datasets/${type}.json` })),
};
fs.writeFileSync(path.join(__dirname, '..', 'exports', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n✓ manifest.json — ${datasetTypes.length} dataset types`);

const total = [departments,employees,customers,repositories,projects,commits,pullRequests,jiraIssues,emails,slackThreads,calendarEvents,meetingTranscripts,incidents,documents,timeline,memory,execReports,knowledgeGraph,permissions,summary,company].reduce((s,a)=>s+(Array.isArray(a)?a.length:1),0);
console.log(`\n✅ Done in ${((Date.now()-start)/1000).toFixed(1)}s — ${total.toLocaleString()} total records`);
