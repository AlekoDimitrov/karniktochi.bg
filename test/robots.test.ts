import { describe, expect, it } from 'vitest';
import { NOINDEX, robotsHeaders } from '../src/lib/robots';

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
