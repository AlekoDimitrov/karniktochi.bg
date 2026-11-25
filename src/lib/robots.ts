// Until the site is built with LAUNCH=1, every response the Worker sends asks search engines to stay away.
// public/_headers only covers static assets; pages rendered by the Worker need this header (and the
// <meta name="robots"> tag in Layout.astro). Launch checklist: docs/HANDOFF.md and CLAUDE.md.
export const NOINDEX = 'noindex, nofollow';

/** The robots header for a build: none once launched (LAUNCH === '1'), noindex otherwise. */
export function robotsHeaders(launch: string | undefined): Record<string, string> {
  return launch === '1' ? {} : { 'X-Robots-Tag': NOINDEX };
}

/** Paths crawlers have no business in once the site is public: admin, cart, checkout and the JSON API. */
export const DISALLOWED_AFTER_LAUNCH = ['/admin/', '/kolichka/', '/porachka/', '/api/'];

/**
 * The site's robots.txt for a build. Until LAUNCH=1 it shuts every crawler out. After launch it allows
 * everything except DISALLOWED_AFTER_LAUNCH, and names the sitemap only when one exists (`sitemapUrl`).
 */
export function robotsTxt(launch: string | undefined, sitemapUrl?: string): string {
  if (launch !== '1') return 'User-agent: *\nDisallow: /\n';
  const lines = ['User-agent: *', ...DISALLOWED_AFTER_LAUNCH.map((p) => `Disallow: ${p}`)];
  if (sitemapUrl) lines.push('', `Sitemap: ${sitemapUrl}`);
  return lines.join('\n') + '\n';
}
