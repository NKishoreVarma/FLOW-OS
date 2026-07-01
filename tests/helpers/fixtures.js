import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_PATH = join(__dirname, '../../demo-company/exports/datasets');

function loadOrEmpty(name) {
  const fp = join(DEMO_PATH, name);
  return existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : [];
}

const allEmployees = loadOrEmpty('employees.json');
const allCustomers = loadOrEmpty('customers.json');
const allDepts     = loadOrEmpty('departments.json');

export const HELIOS_SNAPSHOT = {
  employees:   allEmployees.slice(0, 100),
  customers:   allCustomers.slice(0, 10),
  departments: allDepts,
  manifest: {
    schemaVersion: '1.0',
    organization: { name: 'Helios Software Inc.', slug: 'helios', industry: 'B2B Enterprise SaaS', size: 450 },
    datasets: [
      { type: 'departments', records: allDepts },
      { type: 'employees',   records: allEmployees.slice(0, 100) },
      { type: 'customers',   records: allCustomers.slice(0, 10) },
    ],
  },
};
