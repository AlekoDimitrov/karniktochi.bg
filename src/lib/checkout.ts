import { env } from 'cloudflare:workers';
import { parseCheckout, type CheckoutField, type FieldError } from './checkout-input';
import { bankTransfer } from './config';
import { customerEmail, ownerEmail, sendEmail } from './email';
import { getOrder, insertOrder, OutOfStockError } from './orders';
import { getProducts } from './products';

export type CreateOrderResult =
  | { ok: true; publicId: string; reference: string }
  | { ok: false; errors: Partial<Record<CheckoutField, FieldError>> }
  | { ok: false; outOfStock: string[] };

/**
 * The one entry point for placing an order: validate, price from the product files, save and reserve
 * stock, then send the emails in the background.
 * Rate limiting or a captcha check belongs at the top of this function.
 */
export async function createOrder(raw: unknown, waitUntil: (p: Promise<unknown>) => void): Promise<CreateOrderResult> {
  const bank = bankTransfer();
  const parsed = parseCheckout(raw, { bankTransfer: bank !== null });
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  // Prices and names always come from the product files, never from the browser.
  const products = new Map((await getProducts()).map((p) => [p.id, p.data]));
  if (input.items.some((i) => !products.has(i.productId))) return { ok: false, errors: { items: 'items' } };
  const items = input.items.map((i) => {
    const p = products.get(i.productId)!;
    return { productId: i.productId, name: `${p.brand} ${p.name}`, unitPriceCents: p.priceCents, quantity: i.quantity };
  });
  const fileStock = Object.fromEntries([...products].map(([id, p]) => [id, p.stock]));

  let placed;
  try {
    placed = await insertOrder(env.DB, { ...input, items }, fileStock);
  } catch (e) {
    if (e instanceof OutOfStockError) return { ok: false, outOfStock: e.productIds.map((id) => products.get(id)!.name) };
    throw e;
  }

  waitUntil(sendOrderEmails(placed.id, bank));
  return { ok: true, publicId: placed.publicId, reference: placed.reference };
}

async function sendOrderEmails(orderId: number, bank: ReturnType<typeof bankTransfer>) {
  const order = await getOrder(env.DB, orderId);
  if (!order) return;
  if (!env.RESEND_API_KEY) {
    console.warn(`RESEND_API_KEY is not set; no emails sent for ${order.reference}`);
    return;
  }
  const from = env.EMAIL_FROM;
  const sends: Promise<void>[] = [];
  if (env.SHOP_NOTIFY_EMAIL) {
    sends.push(sendEmail(env.RESEND_API_KEY, { from, to: env.SHOP_NOTIFY_EMAIL, replyTo: order.email ?? undefined, ...ownerEmail(order) }));
  }
  if (order.email) {
    sends.push(sendEmail(env.RESEND_API_KEY, { from, to: order.email, replyTo: env.SHOP_NOTIFY_EMAIL || undefined, ...customerEmail(order, bank) }));
  }
  // The order is already saved, so a failed email is only logged (visible in Workers observability).
  for (const r of await Promise.allSettled(sends)) {
    if (r.status === 'rejected') console.error(`Email for ${order.reference} failed:`, r.reason);
  }
}
