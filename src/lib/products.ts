// The storefront's view of the catalog. Everything reads D1 through src/lib/catalog.ts, and no page loads
// the whole catalog: listings are paginated, product pages read only what they show.
import { env } from 'cloudflare:workers';
import {
  cartLines,
  getProductPage,
  latestPublicProducts,
  listPublicPage,
  type Category,
  type Visibility,
} from './catalog';

export type { Product } from './catalog';

/** Demo products show until the site is built with LAUNCH=1; after that they are left out everywhere. */
export const visibility: Visibility = { includeDemo: import.meta.env.LAUNCH !== '1' };

/** One page of /produkti/ or of a category. */
export const getListingPage = (page: number, category?: Category) => listPublicPage(env.DB, visibility, { page, category });
export const getLatestProducts = (limit: number) => latestPublicProducts(env.DB, visibility, limit);
export const getProductPageData = (id: string) => getProductPage(env.DB, id, visibility);
export const getCartLines = (ids: string[]) => cartLines(env.DB, ids, visibility);
