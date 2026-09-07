/**
 * BusinessHours — determines whether the current moment is within
 * business hours for a given timezone.
 *
 * Default hours: Mon–Fri, 09:00–18:00 (configurable via env).
 */

const DEFAULT_START_HOUR = Number(process.env.BUSINESS_START_HOUR ?? 9);
const DEFAULT_END_HOUR   = Number(process.env.BUSINESS_END_HOUR   ?? 18);

/**
 * @param {string} timezone — IANA timezone string e.g. "America/New_York"
 * @param {Date}   [now]    — defaults to new Date()
 */
export function isBusinessHours(timezone = 'UTC', now = new Date()) {
  const localStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: false,
    weekday: 'short', hour: 'numeric' });

  const [dayPart, timePart] = localStr.split(', ');
  const hour = parseInt(timePart, 10);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  const isWeekday = weekdays.includes(dayPart.slice(0, 3));
  const inHours   = hour >= DEFAULT_START_HOUR && hour < DEFAULT_END_HOUR;

  return isWeekday && inHours;
}

/**
 * Returns the next business-hours start (ISO string) after `now`.
 * Used to delay a job until Monday 09:00 if it fires on a weekend.
 */
export function nextBusinessHoursStart(timezone = 'UTC', now = new Date()) {
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(candidate.getHours() + 1);

  for (let i = 0; i < 168; i++) {   // max 1 week lookahead
    if (isBusinessHours(timezone, candidate)) return candidate.toISOString();
    candidate.setHours(candidate.getHours() + 1);
  }

  return now.toISOString(); // fallback — shouldn't happen
}
