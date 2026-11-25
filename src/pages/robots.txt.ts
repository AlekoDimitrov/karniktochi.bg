import type { APIRoute } from 'astro';
import { robotsTxt } from '../lib/robots';

// Built into a static file (dist/client/robots.txt), so the Worker never answers it. Its content depends on
// the LAUNCH build variable (src/lib/robots.ts). There is no sitemap yet; pass its URL here when there is.
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(robotsTxt(import.meta.env.LAUNCH), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
