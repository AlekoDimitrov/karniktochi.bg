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

/** What the browser needs to show a product in the cart and checkout. Built at build time. */
export type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  stock: number;
  thumb?: string;
};

export async function getCatalog(): Promise<Record<string, CatalogItem>> {
  const { getImage } = await import('astro:assets');
  const products = await getProducts();
  const entries = await Promise.all(
    products.map(async (p) => {
      const img = p.data.images[0];
      const thumb = img ? (await getImage({ src: img, width: 160 })).src : undefined;
      const { name, brand, priceCents, stock } = p.data;
      return [p.id, { id: p.id, name, brand, priceCents, stock, thumb }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
