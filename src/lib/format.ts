// Prices are stored as integer euro cents everywhere. Format only for display.
const eur = new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR' });
export const formatPrice = (cents: number) => eur.format(cents / 100);

/** The last Sunday of a month (0-based), at 01:00 UTC: when EU summer time starts or ends. */
const lastSundayAt1Utc = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0, 1));
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1);
};

/**
 * A UTC timestamp as Sofia local time, "30/10/2026, 14:05" (en-GB short style). Plain arithmetic with the EU
 * summer time rule (UTC+3 from the last Sunday of March to the last Sunday of October, else UTC+2), because
 * Intl with a timeZone costs about 0.1 ms per call in Workers, 5 ms for a page of 50 orders.
 */
export function formatSofiaDateTime(iso: string): string {
  const t = Date.parse(iso);
  const year = new Date(t).getUTCFullYear();
  const summer = t >= lastSundayAt1Utc(year, 2) && t < lastSundayAt1Utc(year, 9);
  const d = new Date(t + (summer ? 3 : 2) * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
