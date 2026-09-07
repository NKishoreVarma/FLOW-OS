import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS = path.join(__dirname, '..', 'exports');
const API = process.env.FLOW_API || 'http://localhost:5001';
const TOKEN = process.env.FLOW_TOKEN;
const WORKSPACE_ID = process.env.FLOW_WORKSPACE_ID;

if (!TOKEN || !WORKSPACE_ID) {
  console.error('Usage: FLOW_TOKEN=<jwt> FLOW_WORKSPACE_ID=<id> node src/import.js');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXPORTS, 'manifest.json'), 'utf8'));
const datasets = {};
for (const ds of manifest.datasets) {
  const fp = path.join(EXPORTS, ds.file);
  if (fs.existsSync(fp)) {
    datasets[ds.type] = JSON.parse(fs.readFileSync(fp, 'utf8'));
    console.log(`  Loaded ${ds.type}: ${datasets[ds.type].length} records`);
  }
}

console.log(`\n🚀 Importing into FLOW workspace: ${WORKSPACE_ID}`);
const response = await fetch(`${API}/api/lifecycle/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`, 'workspace-id': WORKSPACE_ID },
  body: JSON.stringify({ manifest, datasets }),
});
const result = await response.json();
if (!response.ok) { console.error('Import failed:', result); process.exit(1); }
console.log('\n✅ Import complete!');
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(EXPORTS, 'last-import-result.json'), JSON.stringify(result, null, 2));
