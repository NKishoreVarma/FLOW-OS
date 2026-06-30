import faker from '../faker.js';

const TITLES = ['Add pagination support','Fix authentication bug','Refactor database layer','Improve error handling','Add test coverage','Performance optimization','Security: fix XSS vulnerability','Add API rate limiting','Implement retry mechanism','Update dependencies','Add telemetry','Fix memory leak','Implement feature flags','Add batch processing','Fix race condition'];
const STATUSES = [{weight:0.7,value:'merged'},{weight:0.2,value:'open'},{weight:0.1,value:'closed'}];

export function generatePullRequests(repos, engineers, jiraIssues) {
  const prs = [];
  for (const repo of repos) {
    const count = faker.number.int({min:18,max:22});
    for (let i = 1; i <= count; i++) {
      const status = faker.helpers.weightedArrayElement(STATUSES);
      const author = faker.helpers.arrayElement(engineers);
      const createdAt = faker.date.between({from:'2025-01-01',to:'2025-12-01'}).toISOString();
      const title = faker.helpers.arrayElement(TITLES);
      prs.push({
        id: `pr-${repo.id}-${String(i).padStart(3,'0')}`,
        repoId: repo.id, title,
        body: `## Summary\n${faker.lorem.paragraph()}\n\n## Testing\n${faker.lorem.sentence()}`,
        author: author.id,
        reviewers: faker.helpers.arrayElements(engineers.filter(e=>e.id!==author.id), faker.number.int({min:1,max:3})).map(e=>e.id),
        status,
        baseBranch: 'main',
        headBranch: `feature/${faker.helpers.slugify(title).slice(0,25)}`,
        mergedAt: status==='merged' ? faker.date.between({from:createdAt,to:'2025-12-31'}).toISOString() : null,
        createdAt,
        jiraIssueId: Math.random()<0.5 && jiraIssues.length ? faker.helpers.arrayElement(jiraIssues).id : null,
      });
    }
  }
  return prs;
}
