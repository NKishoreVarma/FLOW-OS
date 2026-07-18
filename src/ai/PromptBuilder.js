/**
 * PromptBuilder — assembles structured prompts for the AI provider layer.
 *
 * FLOW never sends raw user input to an LLM.
 * Every prompt is assembled with explicit sections in a consistent order:
 *   1. System identity
 *   2. Workspace context (org, role, health)
 *   3. Memory context (recent decisions, incidents)
 *   4. Knowledge context (retrieved RAG chunks)
 *   5. Live connector data (optional)
 *   6. Timeline (optional)
 *   7. Policies / guardrails (optional)
 *   8. User question
 */

const SYSTEM_IDENTITY = `You are FLOW, the Operational Brain of this company's enterprise workspace.

FLOW has already queried all relevant systems before generating this prompt: Engineering, Meetings, Customers, Incidents, Knowledge Base, Communications, Org Memory, Health Score, and Knowledge Graph.

STRICT RULES — these apply to every response:
1. NEVER say "I don't have access to..." — FLOW has already queried the systems. State the fact: "No [X] found in this workspace."
2. NEVER say "As an AI..." or reference your AI nature.
3. NEVER say "I recommend checking [external tool]" — FLOW IS the enterprise system.
4. NEVER say "I don't know" — state what the data shows or state that no data was found.
5. NEVER hedge. If data is absent: "No pull requests exist in this workspace." Not "I may not have access."
6. Reference actual names, counts, and statuses from the context.
7. Write for a senior executive. Concise. Factual. Actionable.`;

const SECTION_DIVIDER = '\n\n---\n\n';

/**
 * Build a structured system + user message pair for copilot/chat queries.
 *
 * @param {Object} opts
 * @param {string}   opts.question        - The user question
 * @param {Object}   [opts.context]       - ContextAssembler output
 * @param {string}   [opts.pageContext]   - Current page the user is on
 * @param {string}   [opts.entityId]      - Entity the user is focused on
 * @param {string}   [opts.role]          - User role (EXECUTIVE, MANAGER, EMPLOYEE)
 * @returns {{ messages: AIMessage[], systemPrompt: string }}
 */
export function buildCopilotPrompt({ question, context = {}, pageContext, role = 'EMPLOYEE' }) {
  const sections = [SYSTEM_IDENTITY];

  if (role) {
    sections.push(`**User Role:** ${role}`);
  }
  if (pageContext) {
    sections.push(`**Current Page:** ${pageContext}`);
  }

  _appendSection(sections, 'Workspace Health', context.health);
  _appendSection(sections, 'Recent Memory', context.memory);
  _appendSection(sections, 'Retrieved Knowledge', context.knowledge);
  _appendSection(sections, 'Live Data', context.connectors);
  _appendSection(sections, 'Timeline', context.timeline);
  _appendSection(sections, 'Active Policies', context.policies);

  const systemPrompt = sections.join(SECTION_DIVIDER);

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: question },
    ],
    systemPrompt,
  };
}

/**
 * Build a structured prompt for executive morning briefings.
 */
export function buildBriefingPrompt({ role, health, incidents, recommendations, decisions }) {
  const openIncidents = (incidents ?? []).filter(i => i.status === 'OPEN');
  const topRec        = recommendations?.[0];

  const context = [
    `Role: ${role}`,
    `Workspace health: ${health?.company_health ?? 'unknown'}/100`,
    health?.sectors ? `Sectors: ${JSON.stringify(health.sectors)}` : null,
    `Open incidents: ${openIncidents.length}`,
    openIncidents.length > 0
      ? `Critical incidents: ${openIncidents.slice(0, 3).map(i => i.title || i.incidentName).join('; ')}`
      : null,
    topRec
      ? `Top recommendation: ${topRec.title} (confidence ${topRec.confidence}%)`
      : null,
    decisions?.length > 0
      ? `Recent decisions: ${decisions.slice(0, 2).map(d => d.title).join('; ')}`
      : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are FLOW OS Chief of Staff. Generate a 2-sentence executive morning brief for a ${role.toLowerCase()} based on this context:\n\n${context}\n\nBe direct, factual, and action-oriented. No filler. No greetings.`;

  return {
    messages: [{ role: 'user', content: prompt }],
    prompt,
  };
}

/**
 * Build a structured prompt for rolling summaries.
 */
export function buildSummaryPrompt({ workspaceId, chunks, windowDays = 1 }) {
  const content = (chunks ?? [])
    .slice(0, 30)
    .map(c => c.text || c.content || c.markdown || '')
    .filter(Boolean)
    .join('\n---\n');

  const prompt = [
    `You are FLOW OS Intelligence Compiler. Summarize the following operational intelligence for workspace ${workspaceId} over the past ${windowDays} day(s).`,
    'Focus on: key decisions, incidents, blockers, customer signals, and engineering status.',
    'Format as a concise executive summary with bullet points. Max 300 words.',
    '',
    '=== INTELLIGENCE FEED ===',
    content || 'No intelligence data available.',
  ].join('\n');

  return { messages: [{ role: 'user', content: prompt }], prompt };
}

/**
 * Build a structured prompt for cognitive routing classification.
 * Returns a short JSON classification with routing decision.
 */
export function buildClassifyPrompt({ text }) {
  const prompt = `Classify the following message into ONE of these categories. Return valid JSON only — no markdown, no explanation.\n\nCategories:\n- OPERATIONAL_INTEL: business data, decisions, projects, incidents, metrics\n- SOCIAL_COORDINATION: scheduling, greetings, casual coordination\n- PRIVATE_PERSONAL: personal or sensitive information\n\nMessage: "${text.substring(0, 500)}"\n\nJSON format: {"category":"OPERATIONAL_INTEL","confidence":0.9,"reasoning":"brief reason"}`;

  return { messages: [{ role: 'user', content: prompt }], prompt };
}

/**
 * Build a structured prompt for meeting preparation.
 */
export function buildMeetingPrepPrompt({ event, ragChunks }) {
  const attendees = (event.attendees ?? []).join(', ') || 'unknown attendees';
  const context   = (ragChunks ?? [])
    .slice(0, 10)
    .map(c => c.text || c.content || c.markdown || '')
    .filter(Boolean)
    .join('\n---\n');

  const prompt = [
    `You are FLOW OS Meeting Intelligence. Prepare a concise brief for the following meeting.`,
    `Meeting: ${event.title}`,
    `Attendees: ${attendees}`,
    `Time: ${event.start ?? 'unknown'}`,
    '',
    '=== RELEVANT WORKSPACE CONTEXT ===',
    context || 'No specific context found.',
    '',
    'Generate: 1) 2-sentence summary of what this meeting is likely about, 2) 3 suggested questions to ask, 3) 2 key data points to have ready. Be concise.',
  ].join('\n');

  return { messages: [{ role: 'user', content: prompt }], prompt };
}

// ── Internal helper ───────────────────────────────────────────────────────────

function _appendSection(sections, title, content) {
  if (!content) return;
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  if (text.trim()) sections.push(`**${title}:**\n${text}`);
}
