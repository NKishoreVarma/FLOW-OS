/**
 * Universal Action Registry — public barrel export.
 *
 * Import `actionRegistry` to resolve/list/search definitions.
 * Import `loadRegistry` to initialize the registry at boot.
 */

export { actionRegistry, ActionNotFoundError, RegistryValidationError } from './ActionRegistry.js';
export { ActionValidator }  from './ActionValidator.js';
export { ActionSearch }     from './ActionSearch.js';
export { loadRegistry }     from './RegistryLoader.js';
