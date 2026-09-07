/**
 * ConversationExperienceEngine (CXE) — delegates to HumanInteractionEngine.
 *
 * This module is kept as a stable re-export surface so existing callers
 * (copilotService, brainRoutes, briefingEngine) don't need import path changes.
 * All logic now lives in HumanInteractionEngine (Phase 9.7).
 */

export { process, quickClean } from './HumanInteractionEngine.js';
