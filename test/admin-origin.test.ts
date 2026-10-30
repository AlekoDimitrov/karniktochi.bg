import { describe, expect, it } from 'vitest';
import { isSameOriginRequest } from '../src/lib/admin-origin';

const site = 'https://karniktochi.kalekcho.workers.dev';
const req = (method: string, origin?: string) =>
  new Request(`${site}/admin/`, { method, headers: origin === undefined ? {} : { Origin: origin } });

describe('admin cross-site request check', () => {
  it('allows a POST from the site itself', () => {
    expect(isSameOriginRequest(req('POST', site), site)).toBe(true);
  });

  it.each([
    ['no Origin header', undefined],
    ['another site', 'https://evil.example'],
    ['the literal null origin', 'null'],
    ['the same host over http', 'http://karniktochi.kalekcho.workers.dev'],
    ['a subdomain of the site', 'https://x.karniktochi.kalekcho.workers.dev'],
    ['the origin with a trailing slash', `${site}/`],
  ])('rejects a POST with %s', (_, origin) => {
    expect(isSameOriginRequest(req('POST', origin), site)).toBe(false);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('checks %s too', (method) => {
    expect(isSameOriginRequest(req(method, 'https://evil.example'), site)).toBe(false);
    expect(isSameOriginRequest(req(method, site), site)).toBe(true);
  });

  it.each(['GET', 'HEAD'])('does not check %s', (method) => {
    expect(isSameOriginRequest(req(method, 'https://evil.example'), site)).toBe(true);
    expect(isSameOriginRequest(req(method), site)).toBe(true);
  });
});
