import dotenv from 'dotenv';
dotenv.config();

import { registerEntity, linkEntities, EntityTypes, extractEntitiesFromText, getRelatedContext } from './src/services/knowledgeGraphService.js';

async function run() {
  console.log('--- Registering Graph Entities ---');
  registerEntity('U1', EntityTypes.USER, 'Sarah');
  registerEntity('I1042', EntityTypes.INCIDENT, 'INC-1042');
  registerEntity('T1', EntityTypes.TEAM, 'Backend');
  
  console.log('--- Linking Entities ---');
  linkEntities('U1', 'I1042', 'CREATED');
  linkEntities('I1042', 'T1', 'ASSIGNED_TO');

  const mockChunkText = 'Sarah noticed that the server was lagging, which led to INC-1042.';
  
  console.log('\n--- Extracting Entities from Text ---');
  const foundEntities = extractEntitiesFromText(mockChunkText);
  console.log('Found:', foundEntities);

  console.log('\n--- Fetching 2-Hop Context ---');
  const graphContexts = [];
  for (const entityId of foundEntities) {
    const ctx = getRelatedContext(entityId);
    if (ctx.length > 0) graphContexts.push(...ctx);
  }
  
  const uniqueCtx = [...new Set(graphContexts)];
  console.log('Graph Context:');
  uniqueCtx.forEach(c => console.log(`- ${c}`));
}

run();
