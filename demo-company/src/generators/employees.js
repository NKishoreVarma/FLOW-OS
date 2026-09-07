import faker from '../faker.js';
import { DEPARTMENTS } from '../company.js';

const TITLES_BY_DEPT = {
  'dept-executive': ['CEO', 'CTO', 'CPO', 'CFO', 'VP Sales', 'VP Marketing', 'VP Customer Success', 'General Counsel'],
  'dept-eng-platform': ['VP Engineering', 'Senior Engineering Manager', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer', 'Junior Engineer'],
  'dept-eng-analytics': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-eng-connect': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-eng-guard': ['VP Engineering', 'Engineering Manager', 'Staff Engineer', 'Senior Software Engineer', 'Software Engineer'],
  'dept-product': ['Chief Product Officer', 'Director of Product', 'Senior Product Manager', 'Product Manager', 'Associate PM'],
  'dept-design': ['VP Design', 'Design Lead', 'Senior Designer', 'Designer', 'UX Researcher'],
  'dept-qa': ['Director of QA', 'QA Lead', 'Senior QA Engineer', 'QA Engineer'],
  'dept-devops': ['VP Infrastructure', 'Site Reliability Lead', 'Senior SRE', 'SRE', 'DevOps Engineer'],
  'dept-customer-success': ['VP Customer Success', 'Director of CS', 'Senior CSM', 'Customer Success Manager', 'CS Associate'],
  'dept-sales': ['VP Sales', 'Director of Sales', 'Senior Account Executive', 'Account Executive', 'Sales Development Rep'],
  'dept-gtm': ['VP Marketing', 'CFO', 'VP HR', 'General Counsel', 'IT Director', 'Marketing Manager', 'HR Manager', 'Finance Manager', 'Legal Counsel', 'IT Engineer'],
};

const LOCATIONS = ['San Francisco', 'New York', 'London', 'Singapore', 'Austin', 'Remote'];

export function generateEmployees(departments) {
  const employees = [];
  let counter = 1;
  for (const dept of departments) {
    const titles = TITLES_BY_DEPT[dept.id] || ['Manager', 'Senior Specialist', 'Specialist'];
    for (let i = 0; i < dept.headcount; i++) {
      const id = `emp-${String(counter).padStart(3, '0')}`;
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@heliossoftware.com`;
      const title = titles[Math.min(i, titles.length - 1)];
      const startDate = faker.date.between({ from: '2018-03-15', to: '2025-06-01' }).toISOString().split('T')[0];
      employees.push({
        id, name: `${firstName} ${lastName}`, email, title,
        role: i === 0 ? 'ADMIN' : 'MEMBER',
        department: dept.id, manager: null,
        location: faker.helpers.arrayElement(LOCATIONS),
        startDate,
        status: faker.helpers.weightedArrayElement([{weight:0.95,value:'active'},{weight:0.05,value:'inactive'}]),
      });
      counter++;
    }
  }
  // Wire managers
  let offset = 0;
  for (const dept of departments) {
    const deptEmps = employees.slice(offset, offset + dept.headcount);
    if (deptEmps[0].id !== 'emp-001') deptEmps[0].manager = 'emp-001';
    for (let i = 1; i < deptEmps.length; i++) {
      const managerIdx = i <= 3 ? 0 : faker.number.int({ min: 0, max: Math.min(i, 3) - 1 });
      deptEmps[i].manager = deptEmps[managerIdx].id;
    }
    offset += dept.headcount;
  }
  return employees;
}
