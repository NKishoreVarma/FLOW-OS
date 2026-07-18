/**
 * FLOW OS — Structured Output Schema Enforcer
 */

/**
 * Coerces and validates an object to match a simple schema definition.
 * Attempts to repair type mismatches (e.g., converting "true" string to boolean true,
 * "123" string to number 123) and fills in default values for missing keys.
 *
 * @param {any} inputObj - The parsed JSON object to normalize
 * @param {Record<string, { type: string, default?: any, required?: boolean }>} schema - Schema definition
 * @returns {any} coerced and validated object
 */
export function enforceSchema(inputObj, schema) {
  if (!inputObj || typeof inputObj !== 'object') {
    inputObj = {};
  }

  const output = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = inputObj[key];
    const type = rules.type;
    const defaultValue = rules.default !== undefined ? rules.default : null;

    if (value === undefined || value === null) {
      if (rules.required) {
        throw new Error(`Field '${key}' is required but was missing in output.`);
      }
      output[key] = defaultValue;
      continue;
    }

    // Coercion rules
    if (type === 'boolean') {
      if (typeof value === 'boolean') {
        output[key] = value;
      } else if (typeof value === 'string') {
        output[key] = value.toLowerCase() === 'true';
      } else {
        output[key] = Boolean(value);
      }
    } else if (type === 'number') {
      if (typeof value === 'number') {
        output[key] = value;
      } else if (typeof value === 'string') {
        const parsed = parseFloat(value);
        output[key] = isNaN(parsed) ? defaultValue : parsed;
      } else {
        output[key] = defaultValue;
      }
    } else if (type === 'string') {
      if (typeof value === 'string') {
        output[key] = value;
      } else {
        output[key] = String(value);
      }
    } else if (type === 'array') {
      if (Array.isArray(value)) {
        output[key] = value;
      } else if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          output[key] = Array.isArray(parsed) ? parsed : [value];
        } catch {
          output[key] = [value];
        }
      } else {
        output[key] = [value];
      }
    } else if (type === 'object') {
      if (typeof value === 'object' && value !== null) {
        output[key] = value;
      } else {
        output[key] = defaultValue;
      }
    } else {
      output[key] = value;
    }
  }

  return output;
}

export default {
  enforceSchema
};
