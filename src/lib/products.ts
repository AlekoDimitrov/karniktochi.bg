// The storefront's view of the catalog. Everything reads D1 through src/lib/catalog.ts.
import { env } from 'cloudflare:workers';
import {
  getPublicProduct,
  listPublicProducts,
  optionText,
  publicStock,
  type Product,
  type Visibility,
} from './catalog';

export type { Product } from './catalog';

/** Demo products show until the site is built with LAUNCH=1; after that they are left out everywhere. */
export const visibility: Visibility = { includeDemo: import.meta.env.LAUNCH !== '1' };

/** Published products, newest first. */
export const getProducts = (): Promise<Product[]> => listPublicProducts(env.DB, visibility);
export const getProduct = (id: string): Promise<Product | null> => getPublicProduct(env.DB, id, visibility);
export const getPublicStock = () => publicStock(env.DB, visibility);

/** What the browser needs to show a cart line, per variant id. */
export type CatalogItem = {
  id: string;
  productId: string;
  name: string;
  brand: string;
  /** e.g. "Дължина: 210 мм"; empty for products without choices. */
  option: string;
  url: string;
  priceCents: number;
  stock: number;
  thumb?: string;
};

export function toCatalog(products: Product[]): Record<string, CatalogItem> {
  const items: Record<string, CatalogItem> = {};
  for (const p of products) {
    for (const v of p.variants) {
      items[v.id] = {
        id: v.id,
        productId: p.id,
        name: p.name,
        brand: p.brand,
        option: p.variants.length > 1 ? optionText(p.optionLabel, v.optionValue) : '',
        url: `/produkti/${p.id}/${p.variants.length > 1 ? `?v=${encodeURIComponent(v.optionKey)}` : ''}`,
        priceCents: v.priceCents,
        stock: v.stock,
      };
    }
  }
  return items;
}

export const getCatalog = async () => toCatalog(await getProducts());
