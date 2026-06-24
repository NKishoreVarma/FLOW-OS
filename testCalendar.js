import { registerEntity, linkEntities, EntityTypes, extractEntitiesFromText, getRelatedContext } from './src/services/knowledgeGraphService.js';
import { ingestionQueue } from './src/config/queue.js';

async function testCalendarGraphInjection() {
  console.log('--- Simulating Calendar Payload Injection ---');

  const mockEvent = {
    id: '1091',
    summary: 'Architecture Review',
    description: 'Discussing the ingestion queue scaling limits.',
    start: '2026-06-03T10:00:00Z',
    end: '2026-06-03T11:00:00Z',
    attendees: [
      { email: 'sarah@flow-os.com', displayName: 'Sarah' },
      { email: 'david@flow-os.com' }
    ]
  };

  const eventId = `E_${mockEvent.id}`;
  
  // 1. Inject EVENT Node
  registerEntity(eventId, EntityTypes.EVENT, mockEvent.summary);
  console.log(`✅ Registered EVENT Node: ${eventId} (${mockEvent.summary})`);

  let attendeeListStr = '';
  // 2. Inject USER Nodes & Link to EVENT
  if (mockEvent.attendees.length > 0) {
    attendeeListStr = mockEvent.attendees.map(a => a.email).join(', ');
    for (const attendee of mockEvent.attendees) {
      const email = attendee.email;
      const userId = `U_${email}`;
      const name = attendee.displayName || email.split('@')[0];
      
      registerEntity(userId, EntityTypes.USER, name);
      console.log(`✅ Registered USER Node: ${userId} (${name})`);
      
      linkEntities(userId, eventId, 'ATTENDING');
      console.log(`🔗 Linked: USER:${name} --[ATTENDING]--> EVENT:${mockEvent.summary}`);
    }
  }

  // 3. Test Graph Extraction
  console.log('\n--- Testing Graph Traversal ---');
  const mockQueryChunk = "I think Sarah is attending the Architecture Review tomorrow.";
  
  const foundEntities = extractEntitiesFromText(mockQueryChunk);
  console.log(`Found Entities in text:`, foundEntities);
  
  for (const entityId of foundEntities) {
    const contextStrings = getRelatedContext(entityId);
    console.log(`\n2-Hop Context for ${entityId}:`);
    contextStrings.forEach(ctx => console.log(`- ${ctx}`));
  }
}

testCalendarGraphInjection();
