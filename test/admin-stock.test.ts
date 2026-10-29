import { describe, expect, it } from 'vitest';
import { MAX_STOCK, parseStockQuantity } from '../src/lib/orders';

describe('the admin stock form', () => {
  it.each([
    ['0', 0],
    ['6', 6],
    [' 12 ', 12],
    [String(MAX_STOCK), MAX_STOCK],
  ])('accepts %j as %d', (value, n) => expect(parseStockQuantity(value)).toBe(n));

  // Each of these used to be saved or reported as saved: '' became 0 (wiping the stock), the rest were
  // ignored but the page still said "Записано.".
  it.each(['', '   ', '-5', '2.5', '1e3', 'abc', String(MAX_STOCK + 1), '9999999'])('rejects %j', (value) =>
    expect(parseStockQuantity(value)).toBeNull(),
  );

  it('rejects a missing field', () => {
    expect(parseStockQuantity(null)).toBeNull();
  });
});
