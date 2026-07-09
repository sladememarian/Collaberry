/**
 * Estimation is entered as "XdYh" — X workdays, Y hours — case-insensitive on
 * the unit letters, either half optional ("2d3h", "1d", "3h"). A workday is a
 * fixed 8 hours; everything is stored/round-tripped as a plain hour count.
 */
const WORKDAY_HOURS = 8;

const PATTERN = /^\s*(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*$/i;

/** Parses "2d3h" / "1D" / "3h" (case-insensitive) into a total hour count.
 *  Returns null for empty/unparseable input. */
export function parseEstimation(text: string): number | null {
  if (!text.trim()) return null;
  const m = PATTERN.exec(text);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const days = m[1] !== undefined ? parseFloat(m[1]) : 0;
  const hours = m[2] !== undefined ? parseFloat(m[2]) : 0;
  const total = days * WORKDAY_HOURS + hours;
  return total > 0 ? total : total === 0 ? 0 : null;
}

/** Breaks a total hour count into whole workdays + remainder hours. */
function breakDown(totalHours: number): { days: number; hours: number } {
  const days = Math.floor(totalHours / WORKDAY_HOURS);
  const hours = Math.round((totalHours - days * WORKDAY_HOURS) * 100) / 100;
  return { days, hours };
}

/** "19" -> "2 days and 3 hours", "8" -> "1 day", "3" -> "3 hours". */
export function formatEstimation(totalHours: number | null): string {
  if (totalHours === null || totalHours <= 0) return "";
  const { days, hours } = breakDown(totalHours);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  return parts.join(" and ") || "0 hours";
}

/** The reverse of parseEstimation, to prefill the input from a stored value. */
export function hoursToXdYh(totalHours: number | null): string {
  if (totalHours === null || totalHours <= 0) return "";
  const { days, hours } = breakDown(totalHours);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.join("");
}
