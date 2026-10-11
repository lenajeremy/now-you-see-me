const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** 1234 → "1.2K". */
export function formatCount(n: number): string {
  return compact.format(n);
}

/** "1 view", "1.2K views". */
export function plural(n: number, word: string, words = `${word}s`): string {
  return `${formatCount(n)} ${n === 1 ? word : words}`;
}

/** Seconds → "4:05" or "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** A timestamp → "3 days ago", "just now". */
export function timeAgo(ms: number, now = Date.now()): string {
  const seconds = Math.round((now - ms) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
  }
  return 'just now';
}

const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

/** A timestamp → "10 Oct 2026". */
export function formatDate(ms: number): string {
  return dateFormat.format(ms);
}

/** "Jeremiah Lena" → "JL". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
