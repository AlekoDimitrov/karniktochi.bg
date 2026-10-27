import { getCollection, type CollectionEntry } from 'astro:content';

export type Product = CollectionEntry<'products'>;

/**
 * Returns all products, newest first.
 * Launch guard: with LAUNCH=1 set (Cloudflare build variable for production), the build
 * FAILS if any demo product is still present, so fake products can never go live.
 */
export async function getProducts(): Promise<Product[]> {
  const all = await getCollection('products');
  if (import.meta.env.LAUNCH === '1' && all.some((p) => p.data.placeholder)) {
    throw new Error('LAUNCH=1 but demo products (placeholder: true) still exist in src/content/products');
  }
  return all.sort((a, b) => b.data.addedAt.getTime() - a.data.addedAt.getTime());
}
