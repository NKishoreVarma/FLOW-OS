/**
 * Action Definition Validator
 *
 * Two responsibilities:
 *   validateDefinition(def)         — throws RegistryValidationError if the shape is wrong
 *   validateInputs(definition, inputs) — returns { valid, errors } for runtime input checking
 */

const REQUIRED_FIELDS = [
  'id', 'version', 'lifecycle', 'connector', 'category',
  'displayName', 'description', 'tags', 'riskLevel', 'approvalPolicy',
  'requiredPermissions', 'requiredScopes', 'executionMode',
  'estimatedDurationMs', 'timeoutMs', 'retryStrategy',
  'rollbackStrategy', 'verificationStrategy', 'requiredInputs',
  'optionalInputs', 'outputSchema', 'auditMetadata', 'telemetryMetadata',
];

const VALID_RISK_LEVELS  = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_LIFECYCLES   = ['DRAFT', 'ACTIVE', 'DEPRECATED', 'DISABLED', 'REMOVED'];
const VALID_EXEC_MODES   = ['SYNC', 'ASYNC', 'STREAMING'];
const ID_PATTERN         = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]+$/;
const SEMVER_PATTERN     = /^\d+\.\d+(\.\d+)?$/;

export class ActionValidator {
  static validateDefinition(def) {
    if (!def || typeof def !== 'object') {
      throw new RegistryValidationError('unknown', ['Definition must be a non-null object']);
    }

    const errors = [];

    for (const field of REQUIRED_FIELDS) {
      if (def[field] === undefined || def[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (def.id && !ID_PATTERN.test(def.id)) {
      errors.push(`Invalid id format: "${def.id}". Must match {connector}.{verb_noun}`);
    }
    if (def.version && !SEMVER_PATTERN.test(def.version)) {
      errors.push(`Invalid version: "${def.version}". Must be semver like 1.0.0`);
    }
    if (def.riskLevel && !VALID_RISK_LEVELS.includes(def.riskLevel)) {
      errors.push(`Invalid riskLevel: "${def.riskLevel}"`);
    }
    if (def.lifecycle && !VALID_LIFECYCLES.includes(def.lifecycle)) {
      errors.push(`Invalid lifecycle: "${def.lifecycle}"`);
    }
    if (def.executionMode && !VALID_EXEC_MODES.includes(def.executionMode)) {
      errors.push(`Invalid executionMode: "${def.executionMode}"`);
    }
    if (def.timeoutMs && def.estimatedDurationMs && def.timeoutMs <= def.estimatedDurationMs) {
      errors.push(`timeoutMs (${def.timeoutMs}) must be > estimatedDurationMs (${def.estimatedDurationMs})`);
    }
    if ((def.riskLevel === 'CRITICAL' || def.riskLevel === 'HIGH') && def.approvalPolicy?.selfApprovalAllowed) {
      errors.push(`${def.riskLevel} risk actions cannot allow self-approval`);
    }
    if (!Array.isArray(def.tags)) {
      errors.push('tags must be an array');
    }
    if (!Array.isArray(def.requiredInputs)) {
      errors.push('requiredInputs must be an array');
    }
    if (!Array.isArray(def.optionalInputs)) {
      errors.push('optionalInputs must be an array');
    }

    if (errors.length > 0) {
      throw new RegistryValidationError(def.id ?? 'unknown', errors);
    }
  }

  static validateInputs(definition, inputs) {
    const errors = [];

    for (const schema of definition.requiredInputs ?? []) {
      const value = inputs[schema.name];
      if (value === undefined || value === null || value === '') {
        errors.push({ field: schema.name, code: 'REQUIRED', message: `${schema.name} is required` });
        continue;
      }
      errors.push(...this.#validateField(schema, value).map(e => ({ field: schema.name, ...e })));
    }

    for (const schema of definition.optionalInputs ?? []) {
      const value = inputs[schema.name];
      if (value !== undefined && value !== null) {
        errors.push(...this.#validateField(schema, value).map(e => ({ field: schema.name, ...e })));
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static #validateField(schema, value) {
    const errors = [];
    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({ code: 'TYPE_MISMATCH', message: `Expected string, got ${typeof value}` });
    }
    if (schema.type === 'number' && typeof value !== 'number') {
      errors.push({ code: 'TYPE_MISMATCH', message: `Expected number, got ${typeof value}` });
    }
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ code: 'TYPE_MISMATCH', message: `Expected boolean, got ${typeof value}` });
    }
    if (schema.type === 'enum' && !schema.enum?.includes(value)) {
      errors.push({ code: 'INVALID_ENUM', message: `Must be one of: ${schema.enum?.join(', ')}` });
    }
    if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
      errors.push({ code: 'PATTERN_MISMATCH', message: `Must match pattern: ${schema.pattern}` });
    }
    if (schema.maxLength && typeof value === 'string' && value.length > schema.maxLength) {
      errors.push({ code: 'TOO_LONG', message: `Max length is ${schema.maxLength}` });
    }
    if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) {
      errors.push({ code: 'TOO_SHORT', message: `Min length is ${schema.minLength}` });
    }
    return errors;
  }
}

export class RegistryValidationError extends Error {
  constructor(actionId, errors) {
    super(`Action definition invalid [${actionId}]: ${errors.join('; ')}`);
    this.code    = 'REGISTRY_VALIDATION_ERROR';
    this.actionId = actionId;
    this.errors  = errors;
  }
}
