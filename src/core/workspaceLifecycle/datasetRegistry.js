const _registry = new Map();

export function registerDatasetType({ type, validator, normalizer, resolver, vectorizer, graphBuilder, memoryMapper }) {
  if (!type || typeof type !== 'string') throw new Error('registerDatasetType: type is required');
  _registry.set(type, { type, validator, normalizer, resolver, vectorizer, graphBuilder, memoryMapper });
}

export function getDatasetHandler(type) {
  return _registry.get(type) ?? null;
}

export function getSupportedTypes() {
  return [..._registry.keys()];
}

export function hasDatasetType(type) {
  return _registry.has(type);
}
