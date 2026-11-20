/** Friendly times for the restore panel. Local time throughout. */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today 14:47", "Yesterday 21:30", "Mon 16 Nov 09:05". */
export function whenLabel(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${DAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]} ${time}`;
}

/** "just now", "12 mins ago", "2 hrs ago", "3 days ago". */
export function agoLabel(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "min" : "mins"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hr" : "hrs"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** "Figma, VS Code, Word +2". */
export function appsLine(apps: string[], max = 4): string {
  if (apps.length === 0) return "Nothing open";
  const shown = apps.slice(0, max).join(", ");
  return apps.length > max ? `${shown} +${apps.length - max}` : shown;
}
