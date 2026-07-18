/**
 * ReplayNavigator — navigation math over a timeline: significant markers to jump
 * between, seek-to-timestamp, and step next/previous. Pure functions; the player
 * (client) holds the cursor, the navigator computes where things are.
 */

const MARKER_TYPES = new Set(['incident', 'deployment', 'security', 'approval', 'decision']);

export function buildNavigation(timeline) {
  const frames = timeline.frames || [];
  const markers = [];
  for (let i = 0; i < frames.length; i++) {
    for (const e of frames[i].events) {
      if (MARKER_TYPES.has(e.eventType) || e.priority === 'critical' || (e.importance ?? 0) >= 0.85) {
        markers.push({ frameIndex: i, t: e.ts, eventId: e.eventId, eventType: e.eventType, title: e.title, priority: e.priority });
      }
    }
  }
  return {
    totalFrames: frames.length,
    duration: timeline.span ? new Date(timeline.span.to) - new Date(timeline.span.from) : 0,
    markers: markers.slice(0, 200),
    markerCount: markers.length,
  };
}

/** Frame index at or just before a timestamp. */
export function seek(timeline, ts) {
  const frames = timeline.frames || [];
  const target = new Date(ts).getTime();
  let idx = 0;
  for (let i = 0; i < frames.length; i++) {
    if (new Date(frames[i].t).getTime() <= target) idx = i; else break;
  }
  return idx;
}

export function step(timeline, index, dir = 1) {
  const n = (timeline.frames || []).length;
  return Math.max(0, Math.min(n - 1, index + (dir >= 0 ? 1 : -1)));
}
