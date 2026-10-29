import { describe, expect, it } from 'vitest';
import { orderEmails } from '../src/lib/email';
import { formatPrice } from '../src/lib/format';
import type { Order } from '../src/lib/orders';

const order = (over: Partial<Order> = {}): Order => ({
  id: 7,
  publicId: '0'.repeat(32),
  reference: 'KT-00007',
  status: 'new',
  customerName: 'Иван <Иванов>',
  phone: '+359888123456',
  email: 'ivan@example.test',
  city: 'Варна',
  deliveryMethod: 'address',
  deliveryDetails: 'ул. Морска 5, ет. 2',
  customerNote: 'Звънете след 17 ч.',
  paymentMethod: 'bank_transfer',
  totalCents: 40800,
  internalNote: '',
  createdAt: '2026-10-29T10:00:00Z',
  updatedAt: '2026-10-29T10:00:00Z',
  items: [
    { variantId: 'v1', productId: 'gyuto', name: 'Шибата Гюто', optionLabel: 'Дължина: 240 мм', unitPriceCents: 21900, quantity: 1 },
    { variantId: 'v2', productId: 'gyuto', name: 'Шибата Гюто', optionLabel: 'Дължина: 210 мм', unitPriceCents: 18900, quantity: 1 },
  ],
  ...over,
});
const cfg = { from: 'Карник Точи <porachki@karniktochi.com>', notify: 'team@karniktochi.com' };
const bank = { iban: 'BG80BNBG96611020345678', bic: 'BNBGBGSF', holder: 'Карник ЕООД' };

describe('order emails', () => {
  it('sends one to the shop and one to the customer, each replying to the other', () => {
    const [shop, customer] = orderEmails(order(), cfg, bank);
    expect(shop).toMatchObject({ from: cfg.from, to: 'team@karniktochi.com', replyTo: 'ivan@example.test' });
    expect(customer).toMatchObject({ from: cfg.from, to: 'ivan@example.test', replyTo: 'team@karniktochi.com' });
    expect(customer.subject).toBe('Поръчка KT-00007 е получена — Карник Точи');
  });

  it('names each size, the delivery address and, for bank transfer, the account and reference', () => {
    const [shop, customer] = orderEmails(order(), cfg, bank);
    for (const e of [shop, customer]) {
      expect(e.text).toContain(`1 × Шибата Гюто (Дължина: 240 мм) — ${formatPrice(21900)}`);
      expect(e.text).toContain('До адрес: Варна, ул. Морска 5, ет. 2');
      expect(e.text).toContain('Плащане: Банков превод');
    }
    expect(customer.text).toContain('IBAN: BG80BNBG96611020345678');
    expect(customer.text).toContain('Основание за плащане: KT-00007');
    expect(shop.text).toContain('Бележка от клиента: Звънете след 17 ч.');
  });

  it('escapes what the customer typed in the HTML', () => {
    const [shop] = orderEmails(order(), cfg, bank);
    expect(shop.html).toContain('Иван &lt;Иванов&gt;');
    expect(shop.html).not.toContain('<Иванов>');
  });

  it('sends only the shop email without a customer address, and no bank details for cash on delivery', () => {
    const emails = orderEmails(order({ email: null, paymentMethod: 'cod' }), cfg, bank);
    expect(emails.map((e) => e.to)).toEqual(['team@karniktochi.com']);
    expect(emails[0].replyTo).toBeUndefined();
    const [, customer] = orderEmails(order({ paymentMethod: 'cod' }), cfg, bank);
    expect(customer.text).not.toContain('IBAN');
  });

  it('sends only the customer email when no shop address is set', () => {
    expect(orderEmails(order(), { ...cfg, notify: '' }, null).map((e) => e.to)).toEqual(['ivan@example.test']);
  });
});
