/**
 * copilotService — routes every conversation turn through the ConversationManager.
 *
 * The ConversationManager decides:
 *   - What kind of message this is (intent classification)
 *   - Whether the Operational Brain is needed at all
 *   - How to structure and tone the response
 *
 * This service wraps the existing capability-aware brain pipeline as a lazy
 * `brainQuery` function. ConversationManager calls it only when the plan requires it.
 */

import { ask }                                            from '../ai/BrainRouter.js';
import { assembleContext, buildEvidence }                 from '../ai/ContextAssembler.js';
import { buildCopilotPrompt }                             from '../ai/PromptBuilder.js';
import { formatCopilotResponse }                          from '../ai/ResponseFormatter.js';
import { TaskType }                                       from '../ai/types.js';
import { planCapabilities }                               from '../ai/reasoning/CapabilityPlanner.js';
import { dispatchCapabilities }                           from '../ai/reasoning/CapabilityDispatcher.js';
import { buildContext, formatContextForPrompt }           from '../ai/reasoning/ContextBuilder.js';
import { analyzeIntent }                                  from '../ai/reasoning/IntentAnalyzer.js';
import { processConversationTurn }                        from '../ai/conversation/ConversationManager.js';

export async function answerCopilotQuery(workspaceId, {
  pageContext        = '',
  question,
  entityId           = null,
  role               = 'EMPLOYEE',
  healthScore,
  hasIncidents       = false,
  isInboxZero        = false,
  taskJustDone       = false,
  deploymentSuccess  = false,
  sprintCompleted    = false,
  userName           = null,
}) {
  const wsId = String(workspaceId);

  /**
   * brainQuery — the Operational Brain pipeline.
   * ConversationManager calls this only when the conversation plan requires it.
   * For greetings, small talk, thanks, jokes, etc. it is never called.
   */
  const brainQuery = async (queryText) => {
    console.log(`[Copilot] ▶ Operational Brain — "${queryText.slice(0, 60)}"`);

    const intent = await analyzeIntent(queryText, { pageContext, entityId });
    const plan   = planCapabilities(queryText, intent);

    const [capabilityResults, ctx] = await Promise.all([
      dispatchCapabilities(wsId, plan, intent),
      assembleContext({ workspaceId: wsId, query: queryText, entityId, maxChunks: 6 }),
    ]);

    const builtContext  = buildContext(capabilityResults, intent);
    const contextBlock  = formatContextForPrompt(builtContext, intent);
    const augmentedCtx  = {
      ...ctx,
      knowledge: contextBlock + (ctx.knowledge ? '\n\n' + ctx.knowledge : ''),
    };

    const { messages } = buildCopilotPrompt({ question: queryText, context: augmentedCtx, pageContext, role });

    const aiResponse = await ask({
      taskType:    TaskType.CHAT,
      messages,
      maxTokens:   512,
      temperature: 0.3,
    });

    const evidence  = buildEvidence(ctx.rawChunks ?? [], 5);
    const formatted = formatCopilotResponse({ aiResponse, evidence, chunks: ctx.rawChunks ?? [] });
    console.log(`[Copilot] ✓ Brain done — ${formatted.answer?.length || 0} chars`);

    return {
      answer:  formatted.answer,
      sources: formatted.sources,
      cards:   formatted.cards   || [],
      actions: formatted.actions || [],
    };
  };

  // Route through ConversationManager — intent detection, planning, composition
  return processConversationTurn({
    workspaceId:    wsId,
    query:          question,
    brainQuery,
    pageContext,
    userName,
    healthScore,
    hasIncidents,
    isInboxZero,
    taskJustDone,
    deploymentSuccess,
    sprintCompleted,
  });
}
