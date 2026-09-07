import vm     from 'node:vm';
import path   from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * SandboxRunner — loads and executes extension code in a node:vm context.
 *
 * Each extension runs in its own V8 context with an explicitly-controlled
 * global surface.  The sandbox does NOT inherit the host process's globals;
 * only what is passed into `contextSurface` is accessible.
 *
 * Security invariants:
 *   - No require() / import() of FLOW internals from inside the sandbox
 *   - No access to process, globalThis, Buffer unless explicitly granted
 *   - Timeout per execution call prevents infinite loops
 *   - The sandbox cannot escalate its own permissions
 *
 * Extension code receives the scoped API surface (already permission-gated)
 * and the SDK base classes.  It returns an extension class or a factory.
 */

const SANDBOX_TIMEOUT_MS = parseInt(process.env.EXTENSION_SANDBOX_TIMEOUT_MS || '5000', 10);

export class SandboxRunner {
  constructor() {
    this._contexts = new Map(); // extensionId → vm.Context
  }

  /**
   * Load an extension file into a new sandbox context.
   *
   * @param {string}  extensionId
   * @param {string}  entrypointPath — absolute path to the extension's main file
   * @param {object}  contextSurface — objects injected into the sandbox global
   * @returns {object} the module.exports of the extension file
   */
  async load(extensionId, entrypointPath, contextSurface) {
    const code = await readFile(entrypointPath, 'utf8');
    return this.loadFromSource(extensionId, code, entrypointPath, contextSurface);
  }

  /**
   * Load from a source string (used by tests and the CLI).
   */
  loadFromSource(extensionId, sourceCode, filename, contextSurface) {
    const moduleExports = {};
    const moduleObject  = { exports: moduleExports };

    const sandbox = vm.createContext({
      // Controlled standard globals
      console:   _safeConsole(extensionId),
      setTimeout, setInterval, clearTimeout, clearInterval,
      Promise, JSON, Math, Date, Array, Object, String, Number, Boolean, Error,
      Map, Set, WeakMap, WeakSet, Symbol, RegExp, Uint8Array,

      // Module emulation (CommonJS-compatible source)
      module:  moduleObject,
      exports: moduleExports,
      require: _sandboxRequire(extensionId),

      // FLOW injected surface
      ...contextSurface,
    });

    this._contexts.set(extensionId, sandbox);

    try {
      const script = new vm.Script(sourceCode, {
        filename: filename || `extension:${extensionId}`,
        lineOffset: 0,
      });
      script.runInContext(sandbox, { timeout: SANDBOX_TIMEOUT_MS });
    } catch (err) {
      this._contexts.delete(extensionId);
      throw new SandboxError(extensionId, err);
    }

    // Extension authors may use either CommonJS (module.exports = ...) or
    // a global FlowExtension variable
    return sandbox.module.exports || sandbox.FlowExtension || {};
  }

  /**
   * Destroy a sandbox context, releasing memory.
   */
  unload(extensionId) {
    this._contexts.delete(extensionId);
  }

  hasContext(extensionId) {
    return this._contexts.has(extensionId);
  }
}

function _safeConsole(extensionId) {
  const prefix = `[ext:${extensionId}]`;
  return {
    log:   (...a) => console.log(prefix, ...a),
    warn:  (...a) => console.warn(prefix, ...a),
    error: (...a) => console.error(prefix, ...a),
    info:  (...a) => console.info(prefix, ...a),
  };
}

function _sandboxRequire(extensionId) {
  // Extensions may only import a safe allow-listed set of Node built-ins.
  // Attempts to require FLOW modules or file paths throw immediately.
  const ALLOWED = new Set(['path', 'crypto', 'url', 'querystring', 'util', 'events']);
  return function sandboxedRequire(mod) {
    if (ALLOWED.has(mod)) {
      // Dynamic import of built-ins — safe because we allow-listed
      return require(mod); // eslint-disable-line import/no-commonjs
    }
    throw new Error(
      `Extension "${extensionId}" attempted to require("${mod}") — not permitted. ` +
      `Use the injected FLOW API instead.`,
    );
  };
}

export class SandboxError extends Error {
  constructor(extensionId, cause) {
    super(`Sandbox error in extension "${extensionId}": ${cause.message}`);
    this.name        = 'SandboxError';
    this.extensionId = extensionId;
    this.cause       = cause;
  }
}
