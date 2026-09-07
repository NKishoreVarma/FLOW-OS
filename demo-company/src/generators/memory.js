import faker from '../faker.js';

export function generateMemory(incidents,jiraIssues,documents,calendarEvents) {
  const records=[];let n=1;
  for(const inc of incidents.slice(0,80)){records.push({id:`mem-${String(n++).padStart(3,'0')}`,type:'INCIDENT',content:`${inc.title}: ${inc.rootCause}`,source:'incident-engine',importance:inc.severity==='P0'?0.95:inc.severity==='P1'?0.80:0.60,authority:0.9,timestamp:inc.detectedAt,relatedId:inc.id});}
  for(const issue of jiraIssues.filter(j=>j.type==='epic').slice(0,80)){records.push({id:`mem-${String(n++).padStart(3,'0')}`,type:'DECISION',content:issue.title,source:'decision-engine',importance:0.75,authority:0.85,timestamp:issue.createdAt,relatedId:issue.id});}
  for(const doc of documents.filter(d=>d.type==='post-mortem'||d.type==='rfc').slice(0,80)){records.push({id:`mem-${String(n++).padStart(3,'0')}`,type:'EXECUTIVE_SUMMARY',content:doc.title,source:'knowledge-base',importance:0.70,authority:0.80,timestamp:doc.createdAt,relatedId:doc.id});}
  for(const evt of calendarEvents.filter(e=>e.type==='executive'||e.type==='all-hands').slice(0,60)){records.push({id:`mem-${String(n++).padStart(3,'0')}`,type:'MEETING_NOTE',content:evt.title,source:'calendar',importance:0.65,authority:0.75,timestamp:evt.startTime,relatedId:evt.id});}
  return records.slice(0,300);
}
