import { describe, expect, it } from 'vitest';
import { cartProblems, fixCart } from '../src/lib/cart-stock';

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
});
