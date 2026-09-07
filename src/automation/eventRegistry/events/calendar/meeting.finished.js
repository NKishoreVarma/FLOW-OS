export default {
  id: 'calendar.meeting.finished', version: '1.0.0',
  connector: 'google-calendar', category: 'MEETING', source: 'connector',
  displayName: 'Meeting Finished', description: 'A calendar meeting has ended.',
  priority: 'NORMAL',
  schema: {
    'event.id':          { type: 'string' },
    'event.title':       { type: 'string' },
    'event.startTime':   { type: 'string' },
    'event.endTime':     { type: 'string' },
    'event.attendees':   { type: 'array' },
    'organizer.email':   { type: 'string' },
  },
  deduplication: { enabled: true, keyFields: ['sourceEventId'], windowMs: 120_000 },
  ordering:      { guaranteed: false },
  retry:         { maxAttempts: 2, backoffMs: 500 },
  security:      { signatureRequired: false },
};
