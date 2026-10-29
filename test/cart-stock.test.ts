import { describe, expect, it } from 'vitest';
import { cartProblems, cartScreen, fixCart, limitQty } from '../src/lib/cart-stock';

const stock = { gyuto: 3, petty: 0, nakiri: 1 };

describe('cartProblems', () => {
  it('accepts quantities up to and including the stock', () => {
    expect(cartProblems([{ id: 'gyuto', qty: 3 }, { id: 'nakiri', qty: 1 }], stock)).toEqual([]);
  });

  it('flags sold-out lines, lines above stock and products that no longer exist', () => {
    expect(
      cartProblems(
        [{ id: 'gyuto', qty: 4 }, { id: 'petty', qty: 1 }, { id: 'gone', qty: 2 }, { id: 'nakiri', qty: 1 }],
        stock,
      ),
    ).toEqual([
      { id: 'gyuto', kind: 'over', qty: 4, available: 3 },
      { id: 'petty', kind: 'soldOut', qty: 1 },
      { id: 'gone', kind: 'unavailable', qty: 2 },
    ]);
  });

  it('has nothing to say about an empty cart', () => {
    expect(cartProblems([], stock)).toEqual([]);
  });
});

describe('fixCart', () => {
  it('removes sold-out and unavailable lines, lowers the rest to stock, keeps order', () => {
    const lines = [
      { id: 'petty', qty: 1 },
      { id: 'gyuto', qty: 5 },
      { id: 'gone', qty: 1 },
      { id: 'nakiri', qty: 1 },
    ];
    const { lines: next, fixed } = fixCart(lines, stock);
    expect(next).toEqual([{ id: 'gyuto', qty: 3 }, { id: 'nakiri', qty: 1 }]);
    expect(fixed.map((f) => [f.id, f.kind])).toEqual([['petty', 'soldOut'], ['gyuto', 'over'], ['gone', 'unavailable']]);
    expect(cartProblems(next, stock)).toEqual([]);
  });

  it('changes nothing when the cart is fine', () => {
    const lines = [{ id: 'gyuto', qty: 3 }];
    expect(fixCart(lines, stock)).toEqual({ lines, fixed: [] });
  });

  it('keeps the saved title of a line it lowers', () => {
    const { lines } = fixCart([{ id: 'gyuto', qty: 5, title: 'Гюто, Дължина: 210 мм' }], stock);
    expect(lines).toEqual([{ id: 'gyuto', qty: 3, title: 'Гюто, Дължина: 210 мм' }]);
  });
});

describe('limitQty (typing a quantity in the cart)', () => {
  it('lowers a quantity above the stock and says it did, so the page can explain the change', () => {
    expect(limitQty(9, 4)).toEqual({ qty: 4, lowered: true });
  });

  it('keeps quantities up to the stock as they are', () => {
    expect(limitQty(4, 4)).toEqual({ qty: 4, lowered: false });
    expect(limitQty(2, 4)).toEqual({ qty: 2, lowered: false });
  });

  it('drops fractions before comparing', () => {
    expect(limitQty(4.7, 4)).toEqual({ qty: 4, lowered: false });
    expect(limitQty(5.2, 4)).toEqual({ qty: 4, lowered: true });
  });
});

describe('cartScreen (what the cart page shows)', () => {
  it('shows nothing but the error when loading the lines failed, so no stale lines, total or checkout link remain', () => {
    expect(cartScreen(2, 'failed')).toEqual({ error: true, lines: false, summary: false, empty: false });
  });

  it('shows nothing until the lines have loaded', () => {
    expect(cartScreen(2, 'pending')).toEqual({ error: false, lines: false, summary: false, empty: false });
  });

  it('shows the lines and summary once loaded, and the empty state for an empty cart', () => {
    expect(cartScreen(2, 'loaded')).toEqual({ error: false, lines: true, summary: true, empty: false });
    expect(cartScreen(0, 'loaded')).toEqual({ error: false, lines: false, summary: false, empty: true });
  });
});
