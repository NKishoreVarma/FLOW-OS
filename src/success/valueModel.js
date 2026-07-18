/**
 * FLOW OS — Value Model (Phase 17)
 *
 * The transparent, honest basis for FLOW's ROI estimates. Track 8 ("nothing should feel
 * magical, everything explainable") demands that any modeled number can be traced to an
 * assumption. These are conservative minutes-saved-per-action; the UI shows them so a CTO
 * can see exactly how "Time Saved" is derived. Measured counts come from real records —
 * only the minute weights here are estimates.
 */

// Minutes saved per completed action — deliberately conservative.
export const MINUTES_PER = Object.freeze({
  taskCompleted:          5,   // one governed action executed inside FLOW vs doing it by hand
  approvalExecuted:       6,   // decide + act in one place vs chasing context across apps
  emailDrafted:           8,   // FLOW drafts the reply; human edits + sends
  mergeConflictResolved: 25,   // conflict surfaced with owners vs discovering it late
  meetingPrepared:       15,   // AI prep brief vs assembling context manually
  jiraIssueCreated:       4,   // one-click governed issue vs form-filling
});

// Every item FLOW surfaces/handles in-app is one context switch (app-open) it prevented.
export const MINUTES_PER_CONTEXT_SWITCH = 3;

export function estimateMinutes(counts = {}) {
  let mins = 0;
  for (const [key, m] of Object.entries(MINUTES_PER)) mins += (counts[key] || 0) * m;
  mins += (counts.contextSwitchesPrevented || 0) * MINUTES_PER_CONTEXT_SWITCH;
  return mins;
}

export const VALUE_MODEL = Object.freeze({
  minutesPer: MINUTES_PER,
  minutesPerContextSwitch: MINUTES_PER_CONTEXT_SWITCH,
  note: 'Counts are measured from real FLOW records. Minute weights are conservative estimates, shown for transparency.',
});

export default { MINUTES_PER, MINUTES_PER_CONTEXT_SWITCH, estimateMinutes, VALUE_MODEL };
