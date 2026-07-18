/**
 * FLOW OS — Living Workspace Simulator · Personas (Sprint 5)
 *
 * A small, COHERENT cast of a software company — not random names. Each person has a
 * role, department, and ownership (repos / files / customer accounts) so the simulated
 * activity is causally consistent: the people who own a thing are the ones the events
 * involve, and the ones FLOW notifies.
 */

export const PERSONAS = Object.freeze([
  { id: 'rahul',   name: 'Rahul',      login: 'rahul',    role: 'CTO',      dept: 'engineering', owns: { repos: ['flow-backend'], files: ['auth.js'], accounts: [] } },
  { id: 'kishore', name: 'Kishore',    login: 'kishore',  role: 'Backend',  dept: 'engineering', owns: { repos: ['flow-backend'], files: ['auth.js', 'loginService.js'], accounts: [] } },
  { id: 'david',   name: 'David O.',   login: 'david.o',  role: 'Backend',  dept: 'engineering', owns: { repos: ['flow-backend'], files: ['payments.js'], accounts: [] } },
  { id: 'sarah',   name: 'Sarah Chen', login: 'sarah',    role: 'Frontend', dept: 'engineering', owns: { repos: ['flow-frontend'], files: [], accounts: [] } },
  { id: 'priya',   name: 'Priya N.',   login: 'priya',    role: 'SRE',      dept: 'operations',  owns: { repos: [], files: [], accounts: [] } },
  { id: 'meera',   name: 'Meera',      login: 'meera',    role: 'Sales',    dept: 'sales',       owns: { repos: [], files: [], accounts: ['TechCorp', 'Acme Corp'] } },
  { id: 'james',   name: 'James',      login: 'james',    role: 'PM',       dept: 'product',     owns: { repos: [], files: [], accounts: [] } },
]);

export const REPOS = Object.freeze(['flow-backend', 'flow-frontend', 'flow-connectors']);
export const CUSTOMERS = Object.freeze(['TechCorp', 'Acme Corp', 'Globex', 'Initech']);

export function persona(id) { return PERSONAS.find((p) => p.id === id) || PERSONAS[0]; }
export function engineers() { return PERSONAS.filter((p) => p.dept === 'engineering'); }
export function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }

export default { PERSONAS, REPOS, CUSTOMERS, persona, engineers, pick };
