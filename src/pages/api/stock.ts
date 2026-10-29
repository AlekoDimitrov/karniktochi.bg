import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { visibility } from '../../lib/products';
import { stockResponse } from '../../lib/stock-api';

export const prerender = false;

export const GET: APIRoute = () => stockResponse(env.DB, visibility);
