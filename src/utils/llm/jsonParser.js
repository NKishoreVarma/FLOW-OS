/**
 * FLOW OS — JSON Output Repair & Parser Utilities
 */

/**
 * Extracts a JSON substring from a text block, handling conversational noise
 * or markdown wrappers (like ```json ... ```).
 *
 * @param {string} text
 * @returns {string} extracted JSON string
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  // Strip markdown code block boundaries if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIndex = -1;
  let endIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
    endIndex = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    endIndex = cleaned.lastIndexOf(']');
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return cleaned;
  }

  return cleaned.substring(startIndex, endIndex + 1);
}

/**
 * Attempts to repair basic malformed JSON patterns such as:
 * - Unbalanced/missing closing brackets/braces.
 * - Missing quotes around property names.
 * - Unescaped control characters.
 *
 * @param {string} jsonStr
 * @returns {string} repaired JSON string
 */
export function repairJson(jsonStr) {
  if (!jsonStr) return '{}';

  let s = jsonStr.trim();

  // Basic quote repairs around keys if model missed them: e.g. {key: "value"} -> {"key": "value"}
  s = s.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

  // Count braces/brackets and close them if missing at the end
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }
  }

  // Auto-append missing closers
  if (openBraces > 0) {
    s += '}'.repeat(openBraces);
  }
  if (openBrackets > 0) {
    s += ']'.repeat(openBrackets);
  }

  // Fix trailing commas: e.g. {"a": 1, } -> {"a": 1}
  s = s.replace(/,\s*([}\]])/g, '$1');

  return s;
}

/**
 * Safely parses LLM output by extracting, repairing, and calling JSON.parse.
 *
 * @param {string} rawText
 * @returns {any} parsed JSON object/array
 */
export function safeParse(rawText) {
  const extracted = extractJson(rawText);
  try {
    return JSON.parse(extracted);
  } catch (err) {
    try {
      const repaired = repairJson(extracted);
      return JSON.parse(repaired);
    } catch (repairErr) {
      throw new Error(`JSON parse failed after extraction & repair. Original error: ${err.message}. Repair error: ${repairErr.message}`);
    }
  }
}

/**
 * Validates keys and basic types against a simple schema specification.
 *
 * @param {any} obj
 * @param {Record<string, string>} schemaSpec - e.g. { name: 'string', age: 'number', tags: 'object' }
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(obj, schemaSpec) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['Input is not an object'] };
  }

  for (const [key, type] of Object.entries(schemaSpec)) {
    if (!(key in obj)) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }
    const actualType = typeof obj[key];
    if (type === 'array') {
      if (!Array.isArray(obj[key])) {
        errors.push(`Field ${key} expected array, got ${actualType}`);
      }
    } else if (actualType !== type) {
      errors.push(`Field ${key} expected ${type}, got ${actualType}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parses tool/action payloads from LLM response messages.
 *
 * @param {string} text
 * @returns {{ tool: string, args: any } | null}
 */
export function parseToolResponse(text) {
  try {
    const payload = safeParse(text);
    if (payload && payload.tool) {
      return {
        tool: payload.tool,
        args: payload.args || {}
      };
    }
  } catch (e) {
    // If it's not JSON, match standard action patterns e.g. CALL: tool_name(arg1="val")
    const actionMatch = text.match(/CALL:\s*([a-zA-Z0-9_$]+)\((.*)\)/i);
    if (actionMatch) {
      const tool = actionMatch[1];
      const argsStr = actionMatch[2];
      const args = {};
      const argPairs = argsStr.match(/([a-zA-Z0-9_$]+)\s*=\s*"([^"]*)"/g) || [];
      for (const pair of argPairs) {
        const parts = pair.split('=');
        const k = parts[0].trim();
        const v = parts[1].trim().replace(/^"|"$/g, '');
        args[k] = v;
      }
      return { tool, args };
    }
  }
  return null;
}

export default {
  extractJson,
  repairJson,
  safeParse,
  validateSchema,
  parseToolResponse
};
