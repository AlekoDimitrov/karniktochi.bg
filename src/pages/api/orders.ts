import type { APIRoute } from 'astro';
import { createOrder } from '../../lib/checkout';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, errors: { items: 'items' } }, { status: 400 });
  }
  const result = await createOrder(body, (p) => locals.cfContext.waitUntil(p));
  return Response.json(result, { status: result.ok ? 201 : 422 });
};
