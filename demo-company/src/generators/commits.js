import faker from '../faker.js';

const TYPES = ['feat','fix','refactor','test','docs','perf','chore'];
const SCOPES = ['api','auth','db','ui','worker','cache','queue','metrics'];
const MSGS = ['add pagination','fix race condition','refactor auth middleware','update deps','add unit tests','improve error handling','fix memory leak','add retry logic','optimize queries','add request tracing','implement circuit breaker','add rate limiting','add health check','improve logging'];

export function generateCommits(repos, engineers) {
  const commits = [];
  let n = 1;
  for (const repo of repos) {
    const count = faker.number.int({min:75,max:100});
    for (let i = 0; i < count; i++, n++) {
      commits.push({
        id: `commit-${repo.id}-${String(n).padStart(4,'0')}`,
        repoId: repo.id,
        message: `${faker.helpers.arrayElement(TYPES)}(${faker.helpers.arrayElement(SCOPES)}): ${faker.helpers.arrayElement(MSGS)}`,
        author: faker.helpers.arrayElement(engineers).id,
        sha: faker.git.commitSha(),
        timestamp: faker.date.between({from:'2025-01-01',to:'2025-12-31'}).toISOString(),
        branch: i < count*0.8 ? 'main' : `feature/branch-${n}`,
        filesChanged: faker.number.int({min:1,max:12}),
        additions: faker.number.int({min:5,max:300}),
        deletions: faker.number.int({min:0,max:150}),
      });
    }
  }
  return commits;
}
