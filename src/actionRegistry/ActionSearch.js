/**
 * Action Registry Search
 *
 * Full-text + tag search over the loaded action definitions.
 * Scores: exact id match (10) > tag match (8) > displayName contains (5) > any field (1).
 */

export class ActionSearch {
  static search(query, actions) {
    if (!query || !query.trim()) return actions.filter(a => a.lifecycle === 'ACTIVE');

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return actions
      .filter(a => a.lifecycle === 'ACTIVE')
      .map(a => {
        let score = 0;
        const searchBlob = [
          a.id, a.displayName, a.description, a.connector, a.category,
          ...(a.tags ?? []),
        ].join(' ').toLowerCase();

        for (const term of terms) {
          if (a.id === term)                              score += 20;
          else if (a.id.includes(term))                  score += 10;
          if (a.tags?.includes(term))                    score += 8;
          if (a.displayName.toLowerCase().includes(term)) score += 5;
          if (searchBlob.includes(term))                 score += 1;
        }

        return { action: a, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ action }) => action);
  }
}
