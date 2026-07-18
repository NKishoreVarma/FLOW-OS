import faker from '../faker.js';

const CHANNELS = ['general','engineering','incidents','product','customer-success','platform-team','analytics-team','security','releases','exec-updates'];
const STARTERS = ['Heads up — deployed to production. Monitoring for 30 mins.','Incident update: elevated error rates detected. On it.','Sprint planning doc ready for review.','PSA: dependency has a critical CVE. Patching now.','Customer just escalated — scheduling call.','Weekly metrics update — up MoM.','Architecture decision needed — please review RFC.','Congrats on the promotion! 🎉','Deployment blocked: tests failing in CI.','New customer won! 🚀'];

export function generateSlackThreads(employees, incidents, jiraIssues, customers) {
  return Array.from({length:500},(_,idx)=>{
    const i=idx+1;
    const channel=faker.helpers.arrayElement(CHANNELS);
    const incident=channel==='incidents'&&incidents.length?faker.helpers.arrayElement(incidents):null;
    const jira=faker.datatype.boolean(0.3)&&jiraIssues.length?faker.helpers.arrayElement(jiraIssues):null;
    const msgCount=faker.number.int({min:2,max:15});
    const baseTime=faker.date.between({from:'2025-01-01',to:'2025-12-01'});
    const topic=faker.helpers.arrayElement(STARTERS);
    return {
      id:`slack-${String(i).padStart(4,'0')}`,
      channel:`#${channel}`,
      messages:Array.from({length:msgCount},(_,j)=>({
        author:faker.helpers.arrayElement(employees).id,
        text:j===0?topic:faker.lorem.sentence(),
        timestamp:new Date(baseTime.getTime()+j*faker.number.int({min:60000,max:3600000})).toISOString(),
      })),
      topic,
      relatedIncidentId:incident?.id||null,
      relatedJiraId:jira?.id||null,
    };
  });
}
