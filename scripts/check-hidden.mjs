// Post-build check: messages, banners and errors that scripts show or hide must start hidden in the HTML,
// and the CSS must keep [hidden] from being overridden by a class's display rule. Also: the built robots.txt
// matches this build's LAUNCH (shut out before launch, src/lib/robots.ts).
// Runs as part of `npm run build`; exits non-zero on failure.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const client = 'dist/client';
const failures = [];

// Opening tags carrying the attribute, e.g. <div class="cart-blocked" data-cart-blocked hidden>.
const tagsWith = (html, attr) => html.match(new RegExp(`<[a-z][^>]*\\s${attr}(?=[\\s=>])[^>]*>`, 'g')) ?? [];
const isHidden = (tag) => /\shidden(?=[\s=>])/.test(tag);

function expectHidden(file, html, attrs) {
  for (const attr of attrs) {
    const tags = tagsWith(html, attr);
    if (tags.length === 0) failures.push(`${file}: no element with ${attr}`);
    for (const tag of tags) if (!isHidden(tag)) failures.push(`${file}: not hidden: ${tag}`);
  }
}

// These pages are rendered per request, so check their templates.
const pages = [
  ['src/pages/kolichka/index.astro', ['data-cart-error', 'data-cart-empty', 'data-cart-summary', 'data-cart-fixed', 'data-cart-blocked', 'data-warn', 'data-option']],
  // The product page body, shared by /produkti/{slug}/ and the admin preview.
  ['src/components/ProductView.astro', ['data-added', 'data-max']],
  // Shown by src/scripts/admin-variants.ts; without JavaScript the spare rows are used instead.
  ['src/components/admin/ProductForm.astro', ['data-add-size']],
  ['src/pages/porachka/index.astro', ['data-empty', 'data-checkout', 'data-form-error']],
];
for (const [file, attrs] of pages) expectHidden(file, readFileSync(file, 'utf8'), attrs);

const assets = join(client, '_astro');
const css = readdirSync(assets).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('');
if (!/\[hidden\]\{display:none\s*!important\}/.test(css.replace(/\s+(?=[{:!}])|(?<=[{:])\s+/g, ''))) {
  failures.push(`${assets}/*.css: missing [hidden] { display: none !important; }`);
}

// robots.txt is prerendered into a static file; it must match the LAUNCH this build was made with.
const robots = readFileSync(join(client, 'robots.txt'), 'utf8');
const launched = process.env.LAUNCH === '1';
if (!launched && robots !== 'User-agent: *\nDisallow: /\n') failures.push(`${client}/robots.txt: not "Disallow: /" in a build without LAUNCH=1`);
if (launched && /^Disallow: \/$/m.test(robots)) failures.push(`${client}/robots.txt: still "Disallow: /" in a LAUNCH=1 build`);

if (failures.length) {
  console.error('check-hidden failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('check-hidden: script-toggled elements start hidden');
