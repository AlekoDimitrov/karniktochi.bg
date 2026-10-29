import { createProduct, type ProductInput, type VariantInput } from '../src/lib/catalog';
import type { NewOrder } from '../src/lib/orders';

/** Creates a product; one default variant unless `variants` is given. */
export function addProduct(db: D1Database, over: Partial<ProductInput> & { name: string }, variants?: VariantInput[]) {
  return createProduct(db, {
    brand: 'Тест',
    category: 'gotvarski',
    type: '',
    steel: '',
    bladeLengthMm: null,
    handle: '',
    weightG: null,
    summary: '',
    description: '',
    series: '',
    status: 'published',
    optionName: variants ? 'Length' : '',
    optionLabel: variants ? 'Дължина' : '',
    variants: variants ?? [{ optionValue: '', sku: null, priceCents: 10000, stock: 1 }],
    ...over,
  });
}

export const variantIds = async (db: D1Database, productId: string) =>
  (await db.prepare('SELECT id FROM variants WHERE product_id = ? ORDER BY position').bind(productId).all<{ id: string }>())
    .results.map((r) => r.id);

export const order = (items: [string, number][]): NewOrder => ({
  customerName: 'Иван Иванов',
  phone: '+359888123456',
  email: null,
  city: 'София',
  deliveryMethod: 'office',
  deliveryDetails: 'Еконт, офис Лозенец',
  customerNote: '',
  paymentMethod: 'cod',
  items: items.map(([variantId, quantity]) => ({ variantId, productId: '', name: variantId, optionLabel: '', unitPriceCents: 10000, quantity })),
});
