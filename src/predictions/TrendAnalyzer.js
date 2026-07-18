/**
 * TrendAnalyzer — deterministic trend detection over a time series. Splits the
 * series into a prior and a recent half and reports direction + change. No ML —
 * just an explainable recent-vs-prior comparison the prediction models build on.
 */

const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);

/**
 * @param {Array<{count:number}>|number[]} series chronological
 * @returns {{ direction, changePct, recent, prior, insufficient }}
 */
export function trend(series = []) {
  const counts = series.map(s => (typeof s === 'number' ? s : s.count || 0));
  if (counts.length < 2) return { direction: 'stable', changePct: 0, recent: counts[0] || 0, prior: 0, insufficient: true };

  const mid = Math.floor(counts.length / 2);
  const prior = avg(counts.slice(0, mid));
  const recent = avg(counts.slice(mid));
  const changePct = prior === 0 ? (recent > 0 ? 100 : 0) : Math.round(((recent - prior) / prior) * 100);
  const direction = changePct > 15 ? 'rising' : changePct < -15 ? 'falling' : 'stable';

  return { direction, changePct, recent: +recent.toFixed(2), prior: +prior.toFixed(2), insufficient: false };
}

/** Bucket events into a per-day count series across [sinceDays..now]. */
export function dailySeries(events = [], sinceDays = 30) {
  const buckets = {};
  const start = Date.now() - sinceDays * 86_400_000;
  for (let d = 0; d <= sinceDays; d++) buckets[new Date(start + d * 86_400_000).toISOString().slice(0, 10)] = 0;
  for (const e of events) {
    const day = (e.timestamp || e.ts || '').slice(0, 10);
    if (day in buckets) buckets[day]++;
  }
  return Object.entries(buckets).map(([day, count]) => ({ day, count }));
}
