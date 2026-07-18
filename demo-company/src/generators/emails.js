import faker from '../faker.js';

const SUBJECTS = ['Re: Q3 roadmap discussion','URGENT: Production incident','Customer escalation — SLA breach','Sprint retrospective notes','Architecture decision proposal','Weekly sync agenda','Jira issue resolved pending verification','Onboarding: welcome to Helios!','Security review request','NPS survey results','Contract renewal discussion','Feature request from enterprise client','Post-mortem review','Action items from executive review'];

export function generateEmails(employees, customers, jiraIssues) {
  const emails = [];
  let emailN = 1;
  for (let t = 1; t <= 300 && emailN <= 2000; t++) {
    const threadId = `thread-${String(t).padStart(4,'0')}`;
    const threadLength = faker.number.int({min:3,max:10});
    const isCustomerThread = faker.datatype.boolean(0.35);
    const customer = isCustomerThread ? faker.helpers.arrayElement(customers) : null;
    const jira = faker.datatype.boolean(0.4) && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues) : null;
    const subject = faker.helpers.arrayElement(SUBJECTS);
    const baseTime = faker.date.between({from:'2025-01-01',to:'2025-12-01'});
    for (let i = 0; i < threadLength && emailN <= 2000; i++) {
      const from = isCustomerThread && i%3===0 && customer?.contacts?.length
        ? `customer:${customer.id}`
        : faker.helpers.arrayElement(employees).id;
      emails.push({
        id: `email-${String(emailN).padStart(4,'0')}`,
        from,
        to: [faker.helpers.arrayElement(employees).id],
        subject: i===0 ? subject : `Re: ${subject}`,
        body: faker.lorem.paragraphs(faker.number.int({min:1,max:3})),
        threadId,
        timestamp: new Date(baseTime.getTime()+i*faker.number.int({min:3600000,max:86400000})).toISOString(),
        labels: ['inbox',...(faker.datatype.boolean(0.2)?['important']:[])],
        relatedJiraId: jira?.id||null,
      });
      emailN++;
    }
  }
  return emails.slice(0,2000);
}
