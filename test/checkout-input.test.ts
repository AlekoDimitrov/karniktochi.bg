import { describe, expect, it } from 'vitest';
import { formatBgPhone, normalizeBgPhone, parseCheckout } from '../src/lib/checkout-input';

describe('normalizeBgPhone', () => {
  it.each([
    ['0888 123 456', '+359888123456'],
    ['+359 888 123 456', '+359888123456'],
    ['00359-888-123-456', '+359888123456'],
    ['(02) 123 4567', '+35921234567'],
    ['032 123 456', '+35932123456'],
  ])('accepts %s', (input, out) => expect(normalizeBgPhone(input)).toBe(out));

  it.each(['', '888123456', '+44 7700 900123', '0888 123 45', '0888 123 4567 8', '0088812345', 'abc'])(
    'rejects %j',
    (input) => expect(normalizeBgPhone(input)).toBeNull(),
  );

  it('formats for display', () => {
    expect(formatBgPhone('+359888123456')).toBe('0888 123 456');
    expect(formatBgPhone('+35921234567')).toBe('02 123 4567');
    expect(formatBgPhone('+35932123456')).toBe('032123456');
  });
});

describe('parseCheckout', () => {
  const valid = {
    name: 'Иван Иванов',
    phone: '0888123456',
    city: 'София',
    deliveryMethod: 'office',
    office: 'Еконт Лозенец',
    items: [{ id: 'a', qty: 1 }, { id: 'a', qty: 2 }],
  };

  it('defaults to cash on delivery and merges duplicate lines', () => {
    const r = parseCheckout(valid, { bankTransfer: false });
    expect(r.ok && r.value).toMatchObject({ paymentMethod: 'cod', email: null, items: [{ productId: 'a', quantity: 3 }] });
  });

  it('rejects bank transfer when it is switched off', () => {
    expect(parseCheckout({ ...valid, paymentMethod: 'bank_transfer' }, { bankTransfer: false })).toEqual({
      ok: false,
      errors: { paymentMethod: 'choice' },
    });
    expect(parseCheckout({ ...valid, paymentMethod: 'bank_transfer' }, { bankTransfer: true }).ok).toBe(true);
  });

  it('requires the field that matches the delivery method', () => {
    const r = parseCheckout({ ...valid, deliveryMethod: 'address' }, { bankTransfer: false });
    expect(r).toEqual({ ok: false, errors: { address: 'required' } });
  });

  it('reports bad phone, email and items', () => {
    const r = parseCheckout({ ...valid, phone: '12345', email: 'x@', items: [{ id: 'a', qty: 0 }] }, { bankTransfer: false });
    expect(r).toEqual({ ok: false, errors: { phone: 'phone', email: 'email', items: 'items' } });
  });
});
