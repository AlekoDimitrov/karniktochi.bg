// Cross-site request protection for /admin. Cloudflare Access proves who is signed in, but a signed-in
// browser also sends Access cookies along with a form another site makes it submit. So every request that
// can change something must come from a page on this site: its Origin header must be exactly our origin.
// Astro's checkOrigin does the same for form content types; this covers every content type and is tested.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True if the request may go on: a safe method, or an Origin header equal to the site's own origin. */
export function isSameOriginRequest(request: Request, siteOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  // A missing Origin, or the literal "null" (sandboxed frames, some redirects), is rejected too.
  return request.headers.get('Origin') === siteOrigin;
}
