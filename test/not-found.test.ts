import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A static check of the page sources: a 404 must show the site's Bulgarian 404 page, not a bare
// "Not found" text response. Pages that can't find what was asked for rewrite to /404.
const pagesDir = 'src/pages';
const astroFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? astroFiles(p) : p.endsWith('.astro') ? [p] : [];
  });

describe('404 pages', () => {
  it('has a 404 page rendered per request with status 404', () => {
    const src = readFileSync('src/pages/404.astro', 'utf8');
    expect(src).toContain('export const prerender = false');
    expect(src).toContain('Astro.response.status = 404');
    expect(src).toContain('bg.notFound');
  });

  it('never answers a page request with a bare text 404', () => {
    const offenders = astroFiles(pagesDir).filter((f) => /new Response\([^)]*status:\s*404/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('rewrites to /404 from the product, listing and category pages', () => {
    for (const f of ['src/pages/produkti/[slug].astro', 'src/pages/produkti/index.astro', 'src/pages/kategoriya/[category].astro'])
      expect(readFileSync(f, 'utf8')).toContain("Astro.rewrite('/404')");
  });
});
