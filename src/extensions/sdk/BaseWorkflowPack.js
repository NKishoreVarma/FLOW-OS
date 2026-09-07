import { BaseExtension } from './BaseExtension.js';

/**
 * BaseWorkflowPack — base class for extensions that install workflow templates.
 *
 * Workflow packs contribute named, multi-step workflow definitions that are
 * available to the Execution Engine and Autonomy Engine.  Each definition is
 * registered with WorkflowLoader and can be triggered by recommendations,
 * the Chief of Staff, or manual execution.
 *
 * Subclasses must implement:
 *   - workflowDefinitions() — array of { definition, plannerFn }
 */
export class BaseWorkflowPack extends BaseExtension {
  constructor(manifest, api) {
    super(manifest, api);
    this._registeredWorkflowIds = [];
  }

  /**
   * @returns {Array<{
   *   definition: {
   *     id: string,
   *     version: string,
   *     name: string,
   *     description: string,
   *     connectors: string[],
   *     steps: Array<{ id: string, action: string, connector: string, params: object }>
   *   },
   *   plannerFn?: function
   * }>}
   */
  workflowDefinitions() {
    throw new Error(`${this.constructor.name}.workflowDefinitions() must be implemented`);
  }

  async onEnable() {
    const defs = this.workflowDefinitions();
    for (const { definition, plannerFn } of defs) {
      this.api.workflows.register(definition, plannerFn);
      this._registeredWorkflowIds.push(definition.id);
    }
  }

  async onDisable() {
    for (const id of this._registeredWorkflowIds) {
      this.api.workflows.unregister(id);
    }
    this._registeredWorkflowIds = [];
  }

  async healthCheck() {
    return { healthy: true, registeredWorkflows: this._registeredWorkflowIds };
  }
}
