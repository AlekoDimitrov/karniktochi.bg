import { describe, expect, it } from 'vitest';
import { NOINDEX, robotsHeaders, robotsTxt } from '../src/lib/robots';

describe('robotsHeaders', () => {
  it('asks search engines to stay away until the build has LAUNCH=1', () => {
    expect(NOINDEX).toBe('noindex, nofollow');
    for (const launch of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(robotsHeaders(launch)).toEqual({ 'X-Robots-Tag': 'noindex, nofollow' });
    }
  });

  it('sends no robots header once launched', () => {
    expect(robotsHeaders('1')).toEqual({});
  });
});

describe('robotsTxt', () => {
  it('shuts every crawler out before launch', () => {
    for (const launch of [undefined, '', '0', 'true']) {
      expect(robotsTxt(launch)).toBe('User-agent: *\nDisallow: /\n');
      expect(robotsTxt(launch, 'https://karniktochi.com/sitemap.xml')).toBe('User-agent: *\nDisallow: /\n');
    }
  });

  it('after launch allows everything except admin, cart, checkout and the API', () => {
    expect(robotsTxt('1')).toBe(
      'User-agent: *\nDisallow: /admin/\nDisallow: /kolichka/\nDisallow: /porachka/\nDisallow: /api/\n',
    );
    expect(robotsTxt('1')).not.toMatch(/Disallow: \/$/m);
    expect(robotsTxt('1')).not.toContain('Sitemap');
  });

  it('names the sitemap after launch only when one is given', () => {
    expect(robotsTxt('1', 'https://karniktochi.com/sitemap.xml')).toMatch(
      /Disallow: \/api\/\n\nSitemap: https:\/\/karniktochi\.com\/sitemap\.xml\n$/,
    );
  });
});
