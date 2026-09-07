import { secureVectorSearch } from './src/services/vectorService.js';

// Current acting user: Regular employee in Workspace 1 with engineering access only
const currentActiveUser = {
  name: 'Kishore Varma',
  role: 'employee',
  accessible_channels: ['C_ENGINEERING'] 
};

async function executeTest() {
  console.log('🧪 Running Multi-Tenant Identity Verification Matrix...');
  
  // Search workspace 1 (Our workspace)
  const results = await secureVectorSearch(currentActiveUser, 'Where is the database configuration file located?', 1);
  
  console.log('\n✅ Secure Vector Search Output Received:');
  if (results.length === 0) {
    console.log('❌ Security error: Valid information filtered incorrectly.');
  } else {
    results.forEach(res => {
      console.log(`   [ID: ${res.id}] [Channel: ${res.channel}] Match Text: "${res.text}"`);
    });
  }
}

executeTest();
