import { PRODUCTS } from '../company.js';

export function generateKnowledgeGraph(employees,customers,incidents,repositories) {
  const nodes=[];const edges=[];
  for(const emp of employees.slice(0,100))nodes.push({id:emp.id,type:'employee',name:emp.name,properties:{title:emp.title,department:emp.department}});
  for(const c of customers.slice(0,50))nodes.push({id:c.id,type:'customer',name:c.name,properties:{tier:c.tier,health:c.health}});
  for(const p of PRODUCTS)nodes.push({id:p.id,type:'product',name:p.name,properties:{description:p.description}});
  for(const r of repositories)nodes.push({id:r.id,type:'repository',name:r.name,properties:{language:r.language}});
  for(const inc of incidents.slice(0,30))nodes.push({id:inc.id,type:'incident',name:inc.title,properties:{severity:inc.severity,status:inc.status}});
  for(const emp of employees.slice(0,100)){if(emp.manager)edges.push({source:emp.manager,target:emp.id,relation:'manages',weight:1.0});}
  for(const emp of employees.slice(0,100)){const prod=PRODUCTS.find(p=>p.teamDept===emp.department);if(prod)edges.push({source:emp.id,target:prod.id,relation:'works_on',weight:0.8});}
  for(const c of customers.slice(0,50)){for(const pId of c.products)edges.push({source:c.id,target:pId,relation:'uses',weight:0.9});}
  for(const r of repositories)edges.push({source:r.id,target:r.productId,relation:'belongs_to',weight:1.0});
  for(const inc of incidents.slice(0,30))edges.push({source:inc.id,target:inc.affectedProduct,relation:'affected',weight:0.9});
  return [{nodes,edges}];
}
