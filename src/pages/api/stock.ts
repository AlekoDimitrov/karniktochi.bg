import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getProducts } from '../../lib/products';
import { stockResponse } from '../../lib/stock-api';

export const prerender = false;

export const GET: APIRoute = async () => {
  const fileStock = Object.fromEntries((await getProducts()).map((p) => [p.id, p.data.stock]));
  return stockResponse(env.DB, fileStock);
};
