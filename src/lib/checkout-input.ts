// Parses and validates the checkout form. Pure functions: no Astro or Cloudflare imports.
import type { DeliveryMethod, PaymentMethod } from './orders';

/**
 * Normalizes a Bulgarian phone number to +359XXXXXXXXX, or returns null if it isn't one.
 * Accepts 0888 123 456, +359 888 123 456, 00359888123456, (02) 123 4567, with spaces, dashes, dots or slashes.
 */
export function normalizeBgPhone(input: string): string | null {
  const s = input.replace(/[\s\-().\/]/g, '');
  const m = s.match(/^(?:\+359|00359|0)([2-9]\d{7,8})$/);
  if (!m) return null;
  // Mobile numbers (087x, 088x, 089x, 098x, 099x) always have 9 digits after the 0; landlines 8 or 9.
  if (MOBILE.test(m[1]) && m[1].length !== 9) return null;
  return `+359${m[1]}`;
}

const MOBILE = /^(8[789]|9[89])/;

/** Shows +359888123456 as 0888 123 456 and +35921234567 as 02 123 4567. Other landlines stay unspaced. */
export function formatBgPhone(e164: string): string {
  const n = e164.replace(/^\+359/, '');
  if (MOBILE.test(n)) return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  if (n.startsWith('2')) return `02 ${n.slice(1, 4)} ${n.slice(4)}`;
  return `0${n}`;
}

export type CheckoutInput = {
  customerName: string;
  phone: string;
  email: string | null;
  city: string;
  deliveryMethod: DeliveryMethod;
  deliveryDetails: string;
  customerNote: string;
  paymentMethod: PaymentMethod;
  items: { productId: string; quantity: number }[];
};

export type FieldError = 'required' | 'phone' | 'email' | 'tooLong' | 'choice' | 'items';
export type CheckoutField = 'name' | 'phone' | 'email' | 'city' | 'deliveryMethod' | 'office' | 'address' | 'note' | 'paymentMethod' | 'items';

const MAX_LINES = 50;
const MAX_QTY = 99;

export function parseCheckout(
  raw: unknown,
  opts: { bankTransfer: boolean },
): { ok: true; value: CheckoutInput } | { ok: false; errors: Partial<Record<CheckoutField, FieldError>> } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
  const errors: Partial<Record<CheckoutField, FieldError>> = {};

  const text = (field: CheckoutField, value: string, max: number, required: boolean) => {
    if (required && !value) errors[field] = 'required';
    else if (value.length > max) errors[field] = 'tooLong';
    return value;
  };

  const customerName = text('name', str('name'), 100, true);
  const city = text('city', str('city'), 80, true);
  const customerNote = text('note', str('note'), 1000, false);

  const phoneRaw = str('phone');
  const phone = normalizeBgPhone(phoneRaw);
  if (!phoneRaw) errors.phone = 'required';
  else if (!phone) errors.phone = 'phone';

  const emailRaw = str('email');
  if (emailRaw && (emailRaw.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw))) errors.email = 'email';

  const deliveryMethod = str('deliveryMethod');
  let deliveryDetails = '';
  if (deliveryMethod === 'office') deliveryDetails = text('office', str('office'), 300, true);
  else if (deliveryMethod === 'address') deliveryDetails = text('address', str('address'), 300, true);
  else errors.deliveryMethod = 'choice';

  const paymentMethod = str('paymentMethod') || 'cod';
  if (paymentMethod !== 'cod' && !(paymentMethod === 'bank_transfer' && opts.bankTransfer)) errors.paymentMethod = 'choice';

  // Merge duplicate lines; reject anything that isn't a sane positive integer quantity.
  const qty = new Map<string, number>();
  const rawItems = Array.isArray(r.items) ? r.items : [];
  let badItems = rawItems.length === 0 || rawItems.length > MAX_LINES;
  for (const it of rawItems) {
    const id = (it as { id?: unknown })?.id;
    const q = (it as { qty?: unknown })?.qty;
    if (typeof id !== 'string' || !Number.isInteger(q) || (q as number) < 1) badItems = true;
    else qty.set(id, Math.min((qty.get(id) ?? 0) + (q as number), MAX_QTY));
  }
  if (badItems) errors.items = 'items';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      customerName,
      phone: phone!,
      email: emailRaw || null,
      city,
      deliveryMethod: deliveryMethod as DeliveryMethod,
      deliveryDetails,
      customerNote,
      paymentMethod: paymentMethod as PaymentMethod,
      items: [...qty].map(([productId, quantity]) => ({ productId, quantity })),
    },
  };
}
