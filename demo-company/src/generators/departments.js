import { DEPARTMENTS } from '../company.js';

export function generateDepartments() {
  return DEPARTMENTS.map(d => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    headcount: d.headcount,
  }));
}
