import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyAccess } from './lib/access';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return next();

  // Local dev has no Cloudflare Access in front of it.
  if (!import.meta.env.DEV) {
    const user = await verifyAccess(context.request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (!user) return new Response('Forbidden', { status: 403 });
  }
  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});
