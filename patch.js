const fs = require('fs');

const origPath = 'src/services/retrievalService.js';
const scratchPath = '/Users/kishorevarma/.gemini/antigravity/brain/09ab91c6-dcbe-4cf0-8ae9-6c2e16cfcde3/scratch/retrieve.js';

let orig = fs.readFileSync(origPath, 'utf8');
const scratch = fs.readFileSync(scratchPath, 'utf8');

// 1. Insert import at the top
if (!orig.includes('import { broadcastToWorkspace }')) {
  orig = orig.replace("import pg   from 'pg';", "import pg   from 'pg';\nimport { broadcastToWorkspace } from './socketService.js';");
}

// 2. Remove the old retrieveContext
const retrieveStartIdx = orig.indexOf('export async function retrieveContext');
if (retrieveStartIdx !== -1) {
  // It goes till the upsertVector function
  const upsertStartIdx = orig.indexOf('export async function upsertVector', retrieveStartIdx);
  if (upsertStartIdx !== -1) {
    orig = orig.substring(0, retrieveStartIdx) + orig.substring(upsertStartIdx);
  } else {
    // Or to the end
    orig = orig.substring(0, retrieveStartIdx);
  }
}

// 3. Extract the contents from scratch.js (skipping the import at the top of scratch.js)
const scratchContent = scratch.replace("import { broadcastToWorkspace } from './socketService.js';", "").trim();

// 4. Inject before upsertVector
const upsertStartIdx = orig.indexOf('export async function upsertVector');
if (upsertStartIdx !== -1) {
  orig = orig.substring(0, upsertStartIdx) + scratchContent + '\n\n' + orig.substring(upsertStartIdx);
} else {
  orig += '\n\n' + scratchContent;
}

fs.writeFileSync(origPath, orig, 'utf8');
console.log('Patched retrievalService.js');
