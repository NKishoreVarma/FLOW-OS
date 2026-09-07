/**
 * ReplayPlayer — stateless playback logic for the DVR. The server does not hold a
 * session; these pure functions let any client render "what to show at the cursor"
 * and produce a speed-compressed playback plan. Pause/resume are purely client
 * concerns (stop/continue consuming the plan).
 */

/** The frame at a given index, with progress metadata. */
export function frameAt(timeline, index) {
  const frames = timeline.frames || [];
  const i = Math.max(0, Math.min(frames.length - 1, index));
  return {
    index: i,
    total: frames.length,
    progress: frames.length ? +((i + 1) / frames.length).toFixed(3) : 0,
    frame: frames[i] || null,
  };
}

/** View at a 0..1 scrub position. */
export function cursorView(timeline, position = 0) {
  const frames = timeline.frames || [];
  if (!frames.length) return { index: 0, total: 0, progress: 0, frame: null };
  const i = Math.max(0, Math.min(frames.length - 1, Math.round(position * (frames.length - 1))));
  return frameAt(timeline, i);
}

/**
 * A playback plan: for each frame, the wall-clock offset at which the player
 * should advance to it, compressed by `speed` (real elapsed time / speed). At
 * speed 60, one day of history plays over its duration ÷ 60.
 */
export function playbackPlan(timeline, { speed = 1, maxFrames = 2000 } = {}) {
  const frames = (timeline.frames || []).slice(0, maxFrames);
  if (!frames.length) return { speed, steps: [], totalMs: 0 };
  const t0 = new Date(frames[0].t).getTime();
  const steps = frames.map((f, i) => ({
    index: i,
    t: f.t,
    atMs: Math.round((new Date(f.t).getTime() - t0) / speed),
    count: f.count,
  }));
  return { speed, steps, totalMs: steps[steps.length - 1].atMs, frameCount: frames.length };
}
