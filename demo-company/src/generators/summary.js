import { COMPANY } from '../company.js';

export function generateSummary(employees,customers,repositories) {
  return [{id:`summary-${COMPANY.slug}`,company:COMPANY.name,generatedAt:new Date().toISOString(),totalEmployees:employees.length,totalCustomers:customers.length,totalRepositories:repositories.length,arr:COMPANY.arr}];
}
