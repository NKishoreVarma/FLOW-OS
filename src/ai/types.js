/**
 * Shared type definitions and constants for the AI Provider Layer.
 *
 * Every provider must implement AIProvider. The Brain Router selects a
 * provider and task type based on AIRequest.taskType. No service outside
 * src/ai/ should import from @google/genai or reference Ollama directly.
 */

// Task routing categories — BrainRouter maps these to providers
export const TaskType = Object.freeze({
  // Local-first (Ollama by default)
  CHAT:              'chat',
  SUMMARIZE:         'summarize',
  CLASSIFY:          'classify',
  EXTRACT_ENTITIES:  'extract_entities',
  BRIEF:             'brief',
  SEARCH:            'search',
  MEETING_PREP:      'meeting_prep',

  // Remote-preferred (Gemini by default)
  REASON:            'reason',
  PLAN:              'plan',
  LONG_SYNTHESIS:    'long_synthesis',
  ARCHITECTURE:      'architecture',
  EVAL:              'eval',

  // Embedding — always uses the configured embed provider
  EMBED:             'embed',
});

// Routing hints BrainRouter can attach to requests
export const ProviderHint = Object.freeze({
  LOCAL:   'local',    // prefer local model
  REMOTE:  'remote',   // prefer remote API
  FAST:    'fast',     // prefer lowest latency
  CAPABLE: 'capable',  // prefer most capable model
});

export const ProviderName = Object.freeze({
  OLLAMA:    'ollama',
  GEMINI:    'gemini',
  OPENAI:    'openai',
  ANTHROPIC: 'anthropic',
});

// How the orchestrator chooses among providers
export const RoutingStrategy = Object.freeze({
  QUALITY:   'quality',    // highest capability for the task tier
  SPEED:     'speed',      // lowest measured latency
  COST:      'cost',       // cheapest per token
  BALANCED:  'balanced',   // quality/cost tradeoff (default)
  WORKSPACE: 'workspace',  // workspace-configured preference
  EVALUATE:  'evaluate',   // run all available providers, compare
});

// Task complexity tier — determines which model class to use
export const TaskTier = Object.freeze({
  LIGHT:    'light',     // classify, tag, route, short summary
  STANDARD: 'standard',  // analysis, QA, extraction, search
  HEAVY:    'heavy',     // executive reasoning, long synthesis, planning
});

/**
 * @typedef {Object} AIMessage
 * @property {'system'|'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} AIRequest
 * @property {string}        taskType     - One of TaskType values
 * @property {AIMessage[]}   messages     - Conversation turns
 * @property {string}        [prompt]     - Single-turn shortcut (wraps to messages internally)
 * @property {Object}        [context]    - Assembled workspace context (ContextAssembler output)
 * @property {boolean}       [stream]     - Whether to stream the response
 * @property {number}        [maxTokens]  - Token limit hint
 * @property {number}        [temperature]
 * @property {string}        [providerHint] - One of ProviderHint values
 */

/**
 * @typedef {Object} AIResponse
 * @property {string}   text        - Full response text
 * @property {string}   provider    - Which provider generated this
 * @property {string}   model       - Which model was used
 * @property {number}   latencyMs   - Wall time for the inference call
 * @property {boolean}  [cached]
 * @property {Object}   [usage]     - Token counts if available
 */

/**
 * @typedef {Object} EmbedResponse
 * @property {number[]} values      - Embedding vector
 * @property {string}   provider
 * @property {string}   model
 */

/**
 * @typedef {Object} ProviderHealth
 * @property {string}   provider
 * @property {'healthy'|'degraded'|'offline'} status
 * @property {number}   latencyMs
 * @property {string[]} models
 * @property {boolean}  isDefault
 * @property {boolean}  isFallback
 */
