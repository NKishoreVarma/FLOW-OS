import { BaseExtension } from './BaseExtension.js';

/**
 * BaseAgentPack — base class for extensions that register new AI agents.
 *
 * Agents are registered into the Cognitive Brain's AgentRegistry at enable
 * time and removed at disable time.  Agents registered by packs are treated
 * identically to built-in agents by the 8-stage pipeline.
 *
 * Subclasses must implement:
 *   - agentDefinitions() — returns an array of agent registration objects
 */
export class BaseAgentPack extends BaseExtension {
  constructor(manifest, api) {
    super(manifest, api);
    this._registeredAgentIds = [];
  }

  /**
   * @returns {Array<{
   *   id: string,
   *   name: string,
   *   domains: string[],
   *   AgentClass: Function,
   *   config?: object
   * }>}
   */
  agentDefinitions() {
    throw new Error(`${this.constructor.name}.agentDefinitions() must be implemented`);
  }

  async onEnable() {
    const defs = this.agentDefinitions();
    for (const { id, name, domains, AgentClass, config = {} } of defs) {
      this.api.agents.register({
        id,
        name,
        domains,
        AgentClass,
        config,
        source: 'extension',
        extensionId: this.id,
      });
      this._registeredAgentIds.push(id);
    }
  }

  async onDisable() {
    for (const id of this._registeredAgentIds) {
      this.api.agents.unregister(id);
    }
    this._registeredAgentIds = [];
  }

  async healthCheck() {
    return { healthy: true, registeredAgents: this._registeredAgentIds };
  }
}
