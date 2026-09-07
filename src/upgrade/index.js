export { runMigrations, getAppliedMigrations, listMigrations } from './VersionMigrator.js';
export { validateCompatibility, listVersions, getCurrentVersion } from './CompatibilityValidator.js';
export { createCheckpoint, completeUpgrade, rollback, getCheckpoint, listRollbacks } from './RollbackManager.js';
