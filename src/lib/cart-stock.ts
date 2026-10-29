// Checks the cart against stock. Pure: shared by the cart page, the checkout page and the tests.
// This only guides the customer; the server re-checks stock in D1 when the order is placed.
import type { CartLine } from '../scripts/cart';

export type CartProblem =
  | { id: string; kind: 'unavailable'; qty: number } // product no longer exists
  | { id: string; kind: 'soldOut'; qty: number }
  | { id: string; kind: 'over'; qty: number; available: number };

/**
 * Lines that can't be ordered as they are. `stock` has the available count for every product that exists;
 * a quantity equal to the stock is fine.
 */
export function cartProblems(lines: CartLine[], stock: Record<string, number>): CartProblem[] {
  const problems: CartProblem[] = [];
  for (const { id, qty } of lines) {
    const available = stock[id];
    if (available === undefined) problems.push({ id, kind: 'unavailable', qty });
    else if (available <= 0) problems.push({ id, kind: 'soldOut', qty });
    else if (qty > available) problems.push({ id, kind: 'over', qty, available });
  }
  return problems;
}

/** Removes lines that can't be bought and lowers quantities to the stock. Returns the new lines and what changed. */
export function fixCart(lines: CartLine[], stock: Record<string, number>): { lines: CartLine[]; fixed: CartProblem[] } {
  const fixed = cartProblems(lines, stock);
  const next = lines.flatMap((l) => {
    const p = fixed.find((f) => f.id === l.id);
    if (!p) return [l];
    return p.kind === 'over' ? [{ ...l, qty: p.available }] : [];
  });
  return { lines: next, fixed };
}

/**
 * A quantity typed or added by the customer, limited to the stock. `lowered` is true when it had to be
 * limited, so the page can say why the number changed instead of changing it silently.
 */
export function limitQty(requested: number, available: number): { qty: number; lowered: boolean } {
  const wanted = Math.floor(requested);
  return { qty: Math.max(0, Math.min(wanted, available)), lowered: wanted > available };
}

/**
 * Which parts of the cart page to show. Until the line details have loaded there is nothing to draw; if
 * loading failed, only the error shows, so no stale lines, total or checkout link stay on screen.
 */
export function cartScreen(lineCount: number, load: 'pending' | 'failed' | 'loaded') {
  const ready = load === 'loaded';
  return {
    error: load === 'failed',
    lines: ready && lineCount > 0,
    summary: ready && lineCount > 0,
    empty: lineCount === 0 && load !== 'failed',
  };
}
