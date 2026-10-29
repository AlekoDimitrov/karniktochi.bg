// Live stock from GET /api/stock. Pages may come from Workers Cache with older stock; this corrects what they
// show. On failure it resolves to null and the page keeps the stock it was rendered with. Checkout re-checks stock anyway.

export type StockLevels = Record<string, number>;

let pending: Promise<StockLevels | null> | undefined;

/** Fetched once per page, shared by every script that asks. */
export function liveStock(): Promise<StockLevels | null> {
  pending ??= fetch('/api/stock')
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => (s && typeof s === 'object' && !Array.isArray(s) ? (s as StockLevels) : null))
    .catch(() => null);
  return pending;
}
