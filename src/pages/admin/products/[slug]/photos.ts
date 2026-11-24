// POST /admin/products/{slug}/photos/: one photo's renditions from the Photos section (src/scripts/admin-photos.ts).
// The middleware has already checked Cloudflare Access and the Origin. Answers JSON.
import type { APIRoute } from 'astro';
import * as workers from 'cloudflare:workers';
import { purgerFrom } from '../../../../lib/cache-purge';
import { handleUpload } from '../../../../lib/photo-upload';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const { status, body } = await handleUpload(workers.env.DB, workers.env.MEDIA, purgerFrom(workers), params.slug ?? '', request);
  return Response.json(body, { status });
};
