// `astro dev` only: serves the local R2 simulation (binding MEDIA, in .wrangler/state) at /dev-media/{key}.
// Injected by the dev-media integration in astro.config.mjs only for `astro dev`, so the production build has
// no such route and /dev-media/… there is a plain 404. It never reaches a remote bucket.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const key = params.path ?? '';
  if (!key.startsWith('products/')) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'no-store' },
  });
};
