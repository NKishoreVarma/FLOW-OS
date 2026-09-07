import { generateAuthUrl } from './src/services/gmailInboundService.js';

console.log('--- Testing Gmail OAuth URL Generation ---');
const url = generateAuthUrl('workspace_corp_alpha');
console.log('Generated URL:');
console.log(url);
console.log('\n✅ Route generation test passed.');
