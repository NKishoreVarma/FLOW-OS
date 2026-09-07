/**
 * In-memory Knowledge Graph Service
 * Maps entity nodes and relationships.
 */

const nodes = new Map(); // entityId -> { id, type, name }
const adjacencyList = new Map(); // entityId -> [ { targetId, relationshipType, direction } ]

// Core Entity Types
export const EntityTypes = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  INCIDENT: 'INCIDENT',
  DECISION: 'DECISION',
  TEAM: 'TEAM',
  EVENT: 'EVENT',
  ISSUE: 'ISSUE',
  PROJECT: 'PROJECT',
  CUSTOMER: 'CUSTOMER',
  DEPARTMENT: 'DEPARTMENT',
  OPPORTUNITY: 'OPPORTUNITY'
};

export function registerEntity(id, type, name) {
  if (!nodes.has(id)) {
    nodes.set(id, { id, type, name });
    adjacencyList.set(id, []);
  }
}

export function linkEntities(sourceId, targetId, relationshipType) {
  if (!nodes.has(sourceId) || !nodes.has(targetId)) return;
  
  // Directed edge
  adjacencyList.get(sourceId).push({
    targetId,
    relationshipType,
    direction: 'OUT'
  });

  // Inverse edge for traversal
  adjacencyList.get(targetId).push({
    targetId: sourceId,
    relationshipType,
    direction: 'IN'
  });
}

export function getRelatedContext(entityId) {
  if (!nodes.has(entityId)) return [];
  
  const visited = new Set();
  const queue = [{ id: entityId, hops: 0, path: [] }];
  const contextStrings = [];
  
  visited.add(entityId);

  while (queue.length > 0) {
    const current = queue.shift();
    
    // Add path history to context list
    if (current.hops > 0 && current.path.length > 0) {
      contextStrings.push(current.path.join(' | '));
    }
    
    if (current.hops >= 2) continue; // Stop at 2 hops
    
    const edges = adjacencyList.get(current.id) || [];
    for (const edge of edges) {
      if (!visited.has(edge.targetId)) {
        visited.add(edge.targetId);
        
        const sourceNode = nodes.get(current.id);
        const targetNode = nodes.get(edge.targetId);
        
        let relationStr = '';
        if (edge.direction === 'OUT') {
          relationStr = `${sourceNode.type}:${sourceNode.name} --[${edge.relationshipType}]--> ${targetNode.type}:${targetNode.name}`;
        } else {
          relationStr = `${sourceNode.type}:${sourceNode.name} <--[${edge.relationshipType}]-- ${targetNode.type}:${targetNode.name}`;
        }
        
        queue.push({
          id: edge.targetId,
          hops: current.hops + 1,
          path: [...current.path, relationStr]
        });
      }
    }
  }
  
  return contextStrings;
}

export function extractEntitiesFromText(text) {
  if (!text) return [];
  const foundEntities = [];
  const lowerText = text.toLowerCase();
  
  for (const [id, node] of nodes.entries()) {
    // Avoid short generic name matches to prevent false positives
    if (node.name.length > 3 && lowerText.includes(node.name.toLowerCase())) {
      foundEntities.push(id);
    } else if (id.length > 3 && lowerText.includes(id.toLowerCase())) {
      foundEntities.push(id);
    }
  }
  return foundEntities;
}

export function getGraphMetrics() {
  return {
    nodesCount: nodes.size,
    edgesCount: Array.from(adjacencyList.values()).reduce((sum, list) => sum + list.length, 0) / 2,
    nodes: Array.from(nodes.values())
  };
}
