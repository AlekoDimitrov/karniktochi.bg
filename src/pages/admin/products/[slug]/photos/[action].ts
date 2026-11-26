// POST /admin/products/{slug}/photos/{remove|order|alt}/: the Photos section's actions with JavaScript
// (src/scripts/admin-photo-list.ts), answered in JSON so the edit page never reloads. Without JavaScript the
// same actions are plain forms posted to the edit page. The middleware has already checked Cloudflare Access
// and the Origin.
import type { APIRoute } from 'astro';
import * as workers from 'cloudflare:workers';
import { purgerFrom } from '../../../../../lib/cache-purge';
import { handleJsonPhotoAction, isJsonPhotoAction } from '../../../../../lib/photo-upload';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
  const action = params.action;
  if (!isJsonPhotoAction(action)) return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });
  const { status, body } = await handleJsonPhotoAction(
    workers.env.DB,
    workers.env.MEDIA,
    purgerFrom(workers),
    params.slug ?? '',
    action,
    request,
    (p) => locals.cfContext.waitUntil(p),
  );
  return Response.json(body, { status });
};
