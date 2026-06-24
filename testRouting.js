import { retrieveContext } from './src/services/retrievalService.js';

async function run() {
  try {
    const results = await retrieveContext('1', 'When is the deadline? priority:high channel:C_ENGINEERING from:CEO');
    console.log(JSON.stringify(results, null, 2));
  } catch(e) {
    console.error(e);
  }
}
run();
