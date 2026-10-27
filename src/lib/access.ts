// Verifies the Cloudflare Access token on /admin requests. Access already blocks unauthenticated
// visitors at the edge; this second check means the Worker never serves admin pages to a request
// that didn't come through Access (e.g. via the workers.dev URL or a misconfigured policy).
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksTeam = '';

/** Returns the signed-in email, or null if the request has no valid Access token for this app. */
export async function verifyAccess(request: Request, teamDomain: string, aud: string): Promise<string | null> {
  if (!teamDomain || !aud) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  if (!jwks || jwksTeam !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksTeam = issuer;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
    return typeof payload.email === 'string' ? payload.email : 'access-user';
  } catch {
    return null;
  }
}
