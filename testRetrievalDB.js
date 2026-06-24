import dotenv from 'dotenv';
dotenv.config();

import { retrieveContext } from './src/services/retrievalService.js';

async function run() {
  try {
    const results = await retrieveContext('workspace_corp_alpha', 'what is the current status?');
    console.log(results);
  } catch (e) {
    console.error('Error running retrieveContext:', e);
  }
}
run();
