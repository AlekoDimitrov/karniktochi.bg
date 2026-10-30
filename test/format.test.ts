import { describe, expect, it } from 'vitest';
import { formatSofiaDateTime } from '../src/lib/format';

const intl = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', dateStyle: 'short', timeStyle: 'short' });

describe('Sofia date and time for the admin', () => {
  it('matches Intl with the Europe/Sofia time zone for every hour of 2025–2028', () => {
    const mismatches: string[] = [];
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2029, 0, 1); t += 3600_000) {
      for (const minutes of [0, 59]) {
        const iso = new Date(t + minutes * 60_000).toISOString();
        if (formatSofiaDateTime(iso) !== intl.format(new Date(iso))) mismatches.push(iso);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('switches at 01:00 UTC on the last Sunday of March and October', () => {
    expect(formatSofiaDateTime('2026-03-29T00:59:00Z')).toBe('29/03/2026, 02:59');
    expect(formatSofiaDateTime('2026-03-29T01:00:00Z')).toBe('29/03/2026, 04:00');
    expect(formatSofiaDateTime('2026-10-25T00:59:00Z')).toBe('25/10/2026, 03:59');
    expect(formatSofiaDateTime('2026-10-25T01:00:00Z')).toBe('25/10/2026, 03:00');
  });

  it('reads the timestamps D1 stores (seconds, no milliseconds)', () => {
    expect(formatSofiaDateTime('2026-10-30T12:05:00Z')).toBe('30/10/2026, 14:05');
  });
});
