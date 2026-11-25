// Until the site is built with LAUNCH=1, every response the Worker sends asks search engines to stay away.
// public/_headers only covers static assets; pages rendered by the Worker need this header (and the
// <meta name="robots"> tag in Layout.astro). Launch checklist: docs/HANDOFF.md and CLAUDE.md.
export const NOINDEX = 'noindex, nofollow';

/** The robots header for a build: none once launched (LAUNCH === '1'), noindex otherwise. */
export function robotsHeaders(launch: string | undefined): Record<string, string> {
  return launch === '1' ? {} : { 'X-Robots-Tag': NOINDEX };
}
