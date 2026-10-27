// Client-side cart, kept in localStorage as [{ id, qty }]. Prices are never stored here:
// the server recomputes every price from the product files when an order is placed.

export type CartLine = { id: string; qty: number };

const KEY = 'kt-cart';
const EVENT = 'cart:change';

export function readCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (l): l is CartLine => typeof l?.id === 'string' && Number.isInteger(l.qty) && l.qty > 0,
    );
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines.filter((l) => l.qty > 0)));
  } catch {
    // Storage blocked (private mode etc.): the cart just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds qty of a product, never going above max (the known stock). Returns the new line quantity. */
export function addToCart(id: string, qty = 1, max = Infinity): number {
  const lines = readCart();
  const line = lines.find((l) => l.id === id);
  const next = Math.min((line?.qty ?? 0) + qty, max);
  if (line) line.qty = next;
  else lines.push({ id, qty: next });
  writeCart(lines);
  return next;
}

export function setQty(id: string, qty: number) {
  writeCart(readCart().map((l) => (l.id === id ? { ...l, qty } : l)));
}

export function removeFromCart(id: string) {
  writeCart(readCart().filter((l) => l.id !== id));
}

export function clearCart() {
  writeCart([]);
}

export const cartCount = (lines = readCart()) => lines.reduce((n, l) => n + l.qty, 0);

/** Calls fn now and whenever the cart changes (in this tab or another one). */
export function onCartChange(fn: (lines: CartLine[]) => void) {
  fn(readCart());
  window.addEventListener(EVENT, () => fn(readCart()));
  window.addEventListener('storage', (e) => e.key === KEY && fn(readCart()));
}
