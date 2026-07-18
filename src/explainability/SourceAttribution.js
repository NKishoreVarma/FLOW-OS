/**
 * SourceAttribution — links every conclusion back to typed sources and answers
 * "who said this?" / "what source?". Groups formatted evidence by source type and
 * surfaces the actors behind each claim.
 */

export function attributeSources(formatted = []) {
  const groups = new Map();
  const actors = new Map();

  for (const e of formatted) {
    if (!groups.has(e.sourceType)) groups.set(e.sourceType, { sourceType: e.sourceType, count: 0, refs: [], sources: new Set() });
    const g = groups.get(e.sourceType);
    g.count++; g.refs.push(e.ref); g.sources.add(e.source);

    if (e.actor) {
      if (!actors.has(e.actor)) actors.set(e.actor, { actor: e.actor, refs: [], sourceTypes: new Set() });
      const a = actors.get(e.actor);
      a.refs.push(e.ref); a.sourceTypes.add(e.sourceType);
    }
  }

  const byType = [...groups.values()]
    .map(g => ({ sourceType: g.sourceType, count: g.count, refs: g.refs, sources: [...g.sources] }))
    .sort((a, b) => b.count - a.count);

  const whoSaid = [...actors.values()]
    .map(a => ({ actor: a.actor, refs: a.refs, sourceTypes: [...a.sourceTypes] }))
    .sort((a, b) => b.refs.length - a.refs.length);

  return {
    byType,
    whoSaid,
    totalEvidence: formatted.length,
    distinctSourceTypes: byType.length,
    distinctSources: new Set(formatted.map(e => e.source)).size,
  };
}
