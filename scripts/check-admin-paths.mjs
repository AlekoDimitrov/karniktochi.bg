// Regression check: no spelling of an admin path reaches an admin page without Cloudflare Access.
// Runs the production build the way Cloudflare runs it (wrangler dev against dist/, with dummy non-empty
// ACCESS_TEAM_DOMAIN and ACCESS_AUD so the Access check is on) and requests each path below, unnormalised.
// Every response must be 403 with `private, no-store`, or a 404; never a 200 or a redirect.
// Usage: npm run build && npm run check:admin-paths. Uses a throwaway local database; exits non-zero on failure.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADMIN_PATHS = [
  '/admin/',
  '/admin',
  '/ADMIN/',
  '/Admin/products/',
  '/%61dmin/',
  '/%61dmin/products/',
  '/admin%2Fproducts/',
  '//admin/',
  '/./admin/',
  '/admin/products/../',
  '/x/../admin/',
];

const port = 8790;
const state = mkdtempSync(join(tmpdir(), 'admin-paths-'));
const wrangler = spawn(
  'npx',
  ['wrangler', 'dev', '-c', 'dist/server/wrangler.json', '--port', String(port), '--inspector-port', '9232',
    '--persist-to', state, '--var', 'ACCESS_TEAM_DOMAIN:dummy-team.example', '--var', 'ACCESS_AUD:dummy-aud'],
  { stdio: 'ignore', detached: true },
);

// node:http sends the path exactly as written (fetch() would normalise /./ and /../ first).
const get = (path) =>
  new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, cacheControl: res.headers['cache-control'] ?? '', location: res.headers.location }));
    });
    req.on('error', reject);
    req.end();
  });

const failures = [];
try {
  for (let i = 0; ; i++) {
    try {
      await get('/');
      break;
    } catch {
      if (i > 60) throw new Error('wrangler dev did not start');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('| Path | Status | Cache-Control |');
  console.log('|---|---|---|');
  for (const path of ADMIN_PATHS) {
    const { status, cacheControl, location } = await get(path);
    console.log(`| \`${path}\` | ${status}${location ? ` → ${location}` : ''} | ${cacheControl} |`);
    const forbidden = status === 403 && /\bprivate\b/.test(cacheControl) && /\bno-store\b/.test(cacheControl);
    if (!forbidden && status !== 404) failures.push(`${path}: ${status} ${cacheControl}${location ? ` → ${location}` : ''}`);
  }
} finally {
  process.kill(-wrangler.pid);
  rmSync(state, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`check-admin-paths: admin reachable or wrongly cached:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('check-admin-paths: every admin path spelling is 403 (private, no-store) or 404');
