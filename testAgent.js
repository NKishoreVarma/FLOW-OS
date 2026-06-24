import { evaluateContext } from './src/services/agents/CriticAgent.js';
import { synthesize } from './src/services/agents/ExecutiveSynthesisAgent.js';

async function run() {
  const chunks = [{
    text: 'The project is delayed until next year. [ceo]',
    title: 'Project Status',
    source: 'slack',
    authorityCoeff: 0.8,
    score: 0.9
  }, {
    text: 'The project is on track and will launch this week.',
    title: 'Q3 Plan',
    source: 'vault',
    authorityCoeff: 1.5,
    score: 0.85
  }];

  const queryText = 'What is the project status?';
  const { validatedChunks, contradictions, criticSummary } = evaluateContext(chunks, queryText);
  console.log('Critic Summary:', criticSummary);
  
  const mockRouter = { primaryDomain: 'corporate_intelligence', intentFlags: {isUrgent: true, isComparison: false, isTimeBound: false} };
  
  // We won't test Gemini API because the key isn't loaded in env here, 
  // but it should hit local fallback
  const res = await synthesize(queryText, validatedChunks, mockRouter, criticSummary);
  console.log('Synthesis Brief:', res.answer);
}
run();
