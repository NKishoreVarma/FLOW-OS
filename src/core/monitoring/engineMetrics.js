/**
 * engineMetrics — lightweight in-process timing counters for the intelligence
 * engines (prediction, simulation, …). Each engine calls record() on completion;
 * the aggregator reads snapshot(). Process-scoped; resets on restart (durable
 * history lives in the engines' own memory stores).
 */

const engines = new Map(); // name -> { count, totalMs, samples[], lastAt }

export function record(engine, ms) {
  if (!engines.has(engine)) engines.set(engine, { count: 0, totalMs: 0, samples: [], lastAt: null });
  const e = engines.get(engine);
  e.count++;
  e.totalMs += ms;
  e.lastAt = new Date().toISOString();
  e.samples.push(ms);
  if (e.samples.length > 200) e.samples.shift();
}

export function snapshot() {
  const out = {};
  for (const [name, e] of engines) {
    const sorted = [...e.samples].sort((a, b) => a - b);
    out[name] = {
      runs: e.count,
      avgMs: e.count ? Math.round(e.totalMs / e.count) : 0,
      p95Ms: sorted.length ? sorted[Math.floor(0.95 * (sorted.length - 1))] : 0,
      lastAt: e.lastAt,
    };
  }
  return out;
}
