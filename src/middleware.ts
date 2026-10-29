import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyAccess } from './lib/access';
import { cacheControlFor } from './lib/cache-policy';

// Response.redirect() and some fetched responses have immutable headers; copy those before setting.
function setHeaders(res: Response, headers: Record<string, string>): Response {
  try {
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  } catch {
    const copy = new Response(res.body, res);
    for (const [k, v] of Object.entries(headers)) copy.headers.set(k, v);
    return copy;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) {
    // Every storefront response says whether Workers Cache may keep it (see cache-policy.ts).
    const res = await next();
    const cacheControl = cacheControlFor(context.request.method, pathname, {
      status: res.status,
      setsCookie: res.headers.has('Set-Cookie'),
    });
    return setHeaders(res, { 'Cache-Control': cacheControl });
  }

  // Admin responses are never cached anywhere. The cache key doesn't include the host, so this matters
  // even though Cloudflare Access only protects /admin.
  const adminHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  // Local dev has no Cloudflare Access in front of it.
  if (!import.meta.env.DEV) {
    const user = await verifyAccess(context.request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (!user) return new Response('Forbidden', { status: 403, headers: adminHeaders });
  }
  return setHeaders(await next(), adminHeaders);
});
