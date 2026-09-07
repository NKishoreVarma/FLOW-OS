import { PRODUCTS } from '../company.js';

const REPO_NAMES = {
  'prod-platform': ['api','worker','sdk','ui','infra'],
  'prod-analytics': ['engine','ui','pipeline','sdk'],
  'prod-connect': ['core','adapters','ui','marketplace'],
  'prod-guard': ['core','policy-engine','ui'],
};
const LANGUAGES = { platform:'TypeScript', analytics:'Python', connect:'Go', guard:'Rust' };
const TOPICS = {
  'prod-platform':['workflow','automation','enterprise','saas'],
  'prod-analytics':['analytics','bi','reporting','data'],
  'prod-connect':['api','integration','connectors','marketplace'],
  'prod-guard':['security','compliance','access-control','zero-trust'],
};

export function generateRepositories() {
  const repos = [];
  for (const p of PRODUCTS) {
    for (const slug of REPO_NAMES[p.id]||[]) {
      repos.push({
        id: `repo-${p.slug}-${slug}`,
        name: `helios-${p.slug}-${slug}`,
        productId: p.id,
        description: `${p.name} — ${slug} service`,
        language: LANGUAGES[p.slug]||'TypeScript',
        visibility: 'private',
        defaultBranch: 'main',
        topics: TOPICS[p.id]||[],
      });
    }
  }
  return repos;
}
