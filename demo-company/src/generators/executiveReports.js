import faker from '../faker.js';

const TITLES=['Q1 2025 Business Review','Q2 2025 Investor Update','Q3 2025 Board Deck Summary','January 2025 Monthly Metrics','February 2025 Monthly Metrics','March 2025 Monthly Metrics','April 2025 Monthly Metrics','May 2025 Monthly Metrics','June 2025 Monthly Metrics','July 2025 Monthly Metrics','August 2025 Monthly Metrics','September 2025 Monthly Metrics','H1 2025 Engineering Report','H1 2025 Customer Health Report','Security Posture Report 2025','Annual Product Roadmap 2025','Go-To-Market Q3 Strategy','Competitive Analysis Update','Q4 2025 Sales Forecast','Engineering Velocity Report','Customer Success Metrics Q2','Infrastructure Cost Analysis','Product NPS Deep-Dive','Hiring & Headcount Plan 2025','M&A Target Assessment','Partnership Revenue Report','Churn Analysis Q2 2025','ARR Bridge Q1–Q2 2025','Net Revenue Retention Analysis','Customer Cohort Analysis 2025','Compliance Audit Summary','SOC 2 Readiness Report','Disaster Recovery Test Report','Penetration Test Results 2025','Onboarding Funnel Analysis','Support Ticket Trends Q2','Release Velocity Report','API Usage Analytics','Platform Scalability Assessment','2026 Budget Proposal'];

export function generateExecutiveReports(employees) {
  const execs=employees.filter(e=>e.department==='dept-executive');
  return TITLES.map((title,idx)=>({
    id:`report-${String(idx+1).padStart(2,'0')}`,
    title,
    period:title.match(/Q\d \d{4}|H\d \d{4}|\w+ \d{4}|Annual|2025/)?.[0]||'2025',
    author:faker.helpers.arrayElement(execs).id,
    summary:faker.lorem.paragraph(),
    highlights:Array.from({length:3},()=>faker.lorem.sentence()),
    risks:Array.from({length:2},()=>faker.helpers.arrayElement(['Customer churn risk in SMB segment','Engineering capacity constraints','Competitive pressure from Series B startup','Regulatory compliance gap in EU','Key person dependency','Infrastructure scaling costs exceeding budget'])),
    decisions:Array.from({length:2},()=>faker.lorem.sentence()),
    metrics:{arr:faker.number.int({min:40000000,max:50000000}),customers:faker.number.int({min:195,max:215}),nrr:faker.number.float({min:105,max:130,fractionDigits:1}),headcount:faker.number.int({min:420,max:460})},
    createdAt:faker.date.between({from:'2025-01-01',to:'2025-12-01'}).toISOString(),
  }));
}
