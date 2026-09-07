/**
 * Extension Permission Model
 *
 * Defines the full permission surface extensions may request.
 * Every API the extension calls at runtime is gated by this model.
 *
 * Scopes are grouped:
 *   events.*          — access to the Unified Event Platform
 *   graph.*           — access to the Operational Graph (Digital Twin)
 *   memory.*          — access to Org Memory (decisions/incidents)
 *   executions.*      — access to Execution Records
 *   connectors.*      — access to the Connector Framework
 *   agents.*          — ability to register new agents into the Cognitive Brain
 *   workflows.*       — ability to register workflow definitions
 *   routes.*          — ability to mount custom Express routes
 *   widgets.*         — ability to register Dashboard widgets
 *   executive.*       — access to Executive Intelligence APIs
 *   predictions.*     — access to Prediction Engine
 */

export const PERMISSION_SCOPES = Object.freeze({
  // Event Platform
  'events.read':        { description: 'Query the unified event stream', risk: 'low'    },
  'events.write':       { description: 'Publish events to the bus',      risk: 'medium' },
  'events.subscribe':   { description: 'Register event subscribers',      risk: 'medium' },

  // Operational Graph
  'graph.read':         { description: 'Read graph nodes and edges',      risk: 'low'    },
  'graph.write':        { description: 'Upsert graph nodes and edges',    risk: 'medium' },

  // Memory
  'memory.read':        { description: 'Query org memory records',        risk: 'low'    },
  'memory.write':       { description: 'Write org memory records',        risk: 'medium' },

  // Execution
  'executions.read':    { description: 'Read execution records',          risk: 'low'    },
  'executions.write':   { description: 'Create execution records',        risk: 'high'   },

  // Connectors (always flows through governance)
  'connectors.read':    { description: 'Read connector state and health', risk: 'low'    },
  'connectors.execute': { description: 'Trigger connector actions',       risk: 'high'   },

  // Registration capabilities
  'agents.register':    { description: 'Register new agents',             risk: 'medium' },
  'workflows.register': { description: 'Register workflow definitions',    risk: 'medium' },
  'actions.register':   { description: 'Register action definitions',     risk: 'high'   },
  'routes.mount':       { description: 'Mount custom API routes',         risk: 'high'   },
  'widgets.register':   { description: 'Register dashboard widgets',      risk: 'low'    },

  // Intelligence (read-only)
  'executive.read':     { description: 'Read executive intelligence',     risk: 'low'    },
  'predictions.read':   { description: 'Read prediction results',         risk: 'low'    },
  'kpis.read':          { description: 'Read KPI data',                   risk: 'low'    },
});

export const ALL_SCOPES    = Object.keys(PERMISSION_SCOPES);
export const HIGH_RISK     = ALL_SCOPES.filter(s => PERMISSION_SCOPES[s].risk === 'high');
export const MEDIUM_RISK   = ALL_SCOPES.filter(s => PERMISSION_SCOPES[s].risk === 'medium');
export const LOW_RISK      = ALL_SCOPES.filter(s => PERMISSION_SCOPES[s].risk === 'low');

/**
 * Validate that all requested permissions are known scopes.
 * Returns { valid: boolean, unknown: string[] }
 */
export function validatePermissions(permissions = []) {
  const unknown = permissions.filter(p => !PERMISSION_SCOPES[p]);
  return { valid: unknown.length === 0, unknown };
}

/**
 * Determine required permissions for an extension category.
 * Used as a hint when generating boilerplate — extensions can always request more.
 */
export function suggestedPermissions(category) {
  const MAP = {
    connector:       ['events.write', 'graph.write', 'connectors.read'],
    agent_pack:      ['agents.register', 'memory.read', 'graph.read'],
    workflow_pack:   ['workflows.register', 'executions.read'],
    capability_pack: ['events.read', 'graph.read', 'memory.read'],
    dashboard_widget:['widgets.register', 'events.read', 'executive.read'],
    executive_report:['executive.read', 'kpis.read', 'predictions.read'],
    autonomy_policy: ['executions.read', 'connectors.execute'],
    prediction_model:['predictions.read', 'events.read', 'graph.read'],
    event_handler:   ['events.subscribe', 'events.read'],
    knowledge_provider: ['memory.read', 'graph.read'],
  };
  return MAP[category] || ['events.read'];
}
