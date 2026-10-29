import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToCart, readCart, setQty } from '../src/scripts/cart';

// src/scripts/cart.ts runs in the browser; give it a localStorage and a window to dispatch events on.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('cart lines remember what was added', () => {
  it('saves the title given when a line is added, so it can be named after the variant is gone', () => {
    addToCart('v1', 1, 5, 'Гюто Шибата Котецу, Дължина: 240 мм');
    expect(readCart()).toEqual([{ id: 'v1', qty: 1, title: 'Гюто Шибата Котецу, Дължина: 240 мм' }]);
  });

  it('keeps the title when the quantity changes', () => {
    addToCart('v1', 1, 5, 'Гюто');
    addToCart('v1', 1, 5);
    setQty('v1', 4);
    expect(readCart()).toEqual([{ id: 'v1', qty: 4, title: 'Гюто' }]);
  });

  it('still reads carts saved before titles existed, and ignores a title that is not text', () => {
    localStorage.setItem('kt-cart', JSON.stringify([{ id: 'demo-1', qty: 2 }, { id: 'v2', qty: 1, title: 42 }]));
    expect(readCart()).toEqual([{ id: 'demo-1', qty: 2 }, { id: 'v2', qty: 1 }]);
  });

  it('adds nothing past the stock and returns the unchanged quantity, which the product page reports', () => {
    expect(addToCart('v1', 1, 1)).toBe(1);
    expect(addToCart('v1', 1, 1)).toBe(1);
    expect(readCart()).toEqual([{ id: 'v1', qty: 1 }]);
  });
});
