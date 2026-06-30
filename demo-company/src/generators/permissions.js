import faker from '../faker.js';
import { PRODUCTS } from '../company.js';

export function generatePermissions(employees) {
  const admins=employees.filter(e=>e.role==='ADMIN');
  const resources=[...PRODUCTS.map(p=>`product:${p.id}`),'admin:audit','admin:settings','data:export'];
  const permissions=[];let n=1;
  for(const emp of employees){
    const empRes=emp.role==='ADMIN'?resources:faker.helpers.arrayElements(resources.filter(r=>!r.startsWith('admin:')),faker.number.int({min:1,max:3}));
    for(const resource of empRes){
      permissions.push({id:`perm-${String(n++).padStart(4,'0')}`,employeeId:emp.id,resource,action:emp.role==='ADMIN'?'admin':'read',grantedAt:emp.startDate,grantedBy:faker.helpers.arrayElement(admins).id});
    }
  }
  return permissions;
}
