// CPU per request, as in docs/slice-1-report.md section 1: V8 CPU profiles taken through the Worker's
// inspector (100 µs sampling) while requests are sent one after another. Two sets: the admin pages and the
// storefront (customer-facing pages and the order API).
//
// Needs the production build running under wrangler dev with the inspector on, against a LOCAL performance
// database (scripts/seed-perf.mjs), e.g. in a scratch worktree:
//   npx wrangler dev -c dist/server/wrangler.json --port 8788 --inspector-port 9230
// Usage: node scripts/profile.mjs admin|storefront [base URL] [inspector port] [runs]
// Prints per request: JS+GC, all busy (adds V8's "(program)"), median wall time and response size.

const set = process.argv[2] ?? 'admin';
const base = process.argv[3] ?? 'http://localhost:8788';
const inspectorPort = process.argv[4] ?? '9230';
const runs = Number(process.argv[5] ?? 50);

const targets = await (await fetch(`http://127.0.0.1:${inspectorPort}/json`)).json();
// Wrangler's inspector proxy refuses connections without an Origin header, which Node's built-in WebSocket
// can't send; the `ws` package (installed with wrangler) can.
const { WebSocket } = await import('ws');
const ws = new WebSocket(targets[0].webSocketDebuggerUrl, { headers: { Origin: 'http://localhost' } });
await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 100 });

/** Microseconds per category in a CPU profile. */
function split(profile) {
  const nameOf = new Map(profile.nodes.map((n) => [n.id, n.callFrame.functionName]));
  const sums = { idle: 0, program: 0, gc: 0, js: 0 };
  profile.samples.forEach((nodeId, i) => {
    const dt = profile.timeDeltas[i] ?? 0;
    const name = nameOf.get(nodeId);
    if (name === '(idle)') sums.idle += dt;
    else if (name === '(program)') sums.program += dt;
    else if (name === '(garbage collector)') sums.gc += dt;
    else sums.js += dt;
  });
  return sums;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (us) => (us / 1000).toFixed(1);

/**
 * Profiles `runs` requests. `request(i)` returns [url, init] for the i-th one; `between(i)` runs between
 * requests outside the profile (e.g. to read the form a save needs).
 */
export async function measure(label, request, { between, after } = {}) {
  const totals = { idle: 0, program: 0, gc: 0, js: 0 };
  const walls = [];
  let size = 0;
  // One warm-up request, not counted.
  if (between) await between(-1);
  const [wu, wi] = await request(-1);
  await (await fetch(wu, { redirect: 'manual', ...wi })).arrayBuffer();
  for (let i = 0; i < runs; i++) {
    if (between) await between(i);
    const [url, init] = await request(i);
    await send('Profiler.start');
    const t = performance.now();
    const res = await fetch(url, { redirect: 'manual', ...init });
    const body = await res.clone().arrayBuffer();
    walls.push(performance.now() - t);
    const { result } = await send('Profiler.stop');
    size = body.byteLength;
    if (i === 0 && res.status >= 400) console.error(`${label}: HTTP ${res.status}`);
    if (after) await after(res);
    const s = split(result.profile);
    for (const k of Object.keys(totals)) totals[k] += s[k];
  }
  const jsgc = (totals.js + totals.gc) / runs;
  const busy = (totals.js + totals.gc + totals.program) / runs;
  console.log(`| ${label} | ${size ? `${(size / 1024).toFixed(1)} KB` : ''} | ${ms(jsgc)} | ${ms(busy)} | ${median(walls).toFixed(1)} |`);
}

const get = (path) => () => [`${base}${path}`, {}];
const origin = { Origin: new URL(base).origin };

console.log(`| Request | Size | JS+GC | All busy | Wall (median) |`);
console.log(`|---|---|---|---|---|`);
if (set === 'storefront') {
  // Cacheable pages get a unique query string, so they would miss even where a cache exists (none locally).
  const miss = (path) => (i) => [`${base}${path}${path.includes('?') ? '&' : '?'}m=${i}`, {}];
  await measure('`GET /`', miss('/'));
  await measure('`GET /produkti/`', miss('/produkti/'));
  await measure('`GET /produkti/?page=10`', miss('/produkti/?page=10'));
  await measure('`GET /kategoriya/gotvarski/`', miss('/kategoriya/gotvarski/'));
  await measure('Product page, 5 sizes (`/produkti/perf-450/`)', miss('/produkti/perf-450/'));
  await measure('Product page, 1 size, series of 5 (`/produkti/perf-010/`)', miss('/produkti/perf-010/'));
  await measure('`GET /kolichka/` (cart, never cached)', get('/kolichka/'));
  await measure('`GET /porachka/` (checkout, never cached)', get('/porachka/'));
  await measure('`GET /api/stock` (all 1,000 sizes)', get('/api/stock'));
  await measure('`GET /api/cart-lines`, 5 ids', get('/api/cart-lines?ids=pv-0750,pv-0751,pv-0100,pv-0200,pv-0400'));
  let lastOrder = '';
  await measure('`POST /api/orders` (checkout submit, 1 item; email built, not sent)', () => {
    const body = JSON.stringify({
      name: 'Иван Иванов', phone: '0888123456', email: 'ivan@example.com', city: 'София', deliveryMethod: 'office',
      office: 'Еконт, офис Лозенец', note: '', paymentMethod: 'cod', items: [{ id: 'pv-0750', qty: 1 }],
    });
    return [`${base}/api/orders`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }];
  }, { after: async (res) => (lastOrder = (await res.clone().json()).publicId ?? lastOrder) });
  await measure('`GET /porachka/blagodarim/?id=…` (thank-you page)', () => [`${base}/porachka/blagodarim/?id=${lastOrder}`, {}]);
  ws.close();
  process.exit(0);
}
await measure('`GET /admin/` (orders page 1 of 20)', get('/admin/'));
await measure('`GET /admin/?page=20`', get('/admin/?page=20'));
await measure('`GET /admin/?status=new`', get('/admin/?status=new'));
await measure('`GET /admin/products/` (page 1 of 10)', get('/admin/products/'));
await measure('`GET /admin/products/?page=10`', get('/admin/products/?page=10'));
await measure('`GET /admin/products/?q=гюто` (search)', get(`/admin/products/?q=${encodeURIComponent('гюто')}`));
await measure('`GET /admin/products/?category=kamani&status=published`', get('/admin/products/?category=kamani&status=published'));
await measure('`GET /admin/products/perf-450/` (edit, 5 sizes)', get('/admin/products/perf-450/'));
await measure('`GET /admin/products/perf-450/preview/`', get('/admin/products/perf-450/preview/'));
await measure('`GET /admin/stock/` (redirect)', get('/admin/stock/'));

// Product save: each save needs the form as it is now (updated_at and stock), read outside the profile.
let form;
await measure(
  '`POST /admin/products/perf-450/` (save, 5 sizes)',
  () => [`${base}/admin/products/perf-450/`, { method: 'POST', body: form, headers: origin }],
  {
    between: async (i) => {
      const html = await (await fetch(`${base}/admin/products/perf-450/`)).text();
      form = new URLSearchParams();
      const re = /<(input|textarea|select)\b([^>]*)>(?:([^<]*)<\/textarea>)?/g;
      for (const m of html.matchAll(re)) {
        const attrs = m[2];
        const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
        if (!name || /data-name/.test(attrs)) continue;
        if (/type="(radio|checkbox)"/.test(attrs) && !/\bchecked\b/.test(attrs)) continue;
        if (m[1] === 'select') continue;
        const value = m[1] === 'textarea' ? m[3] : (/\bvalue="([^"]*)"/.exec(attrs)?.[1] ?? '');
        form.set(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
      }
      form.set('category', /<option value="([a-z]+)" selected/.exec(html)?.[1] ?? 'gotvarski');
      form.set('summary', `Кратко описание ${i}.`);
    },
  },
);

// Quick edit: alternate the stock of one size between two values; the shown stock is tracked here.
let stockNow = null;
await measure('`POST /admin/products/` (quick edit, price and stock)', (i) => {
  const next = stockNow === 5 ? 6 : 5;
  const body = new URLSearchParams({ action: 'quick', id: 'pv-0900', price: next === 5 ? '199,00' : '199,50', stock: String(next), stock_was: String(stockNow ?? 0) });
  stockNow = next;
  return [`${base}/admin/products/`, { method: 'POST', body, headers: origin }];
}, {
  between: async () => {
    if (stockNow !== null) return;
    const html = await (await fetch(`${base}/admin/products/?q=SKU-pv-0900`)).text();
    stockNow = Number(/name="stock_was" value="(\d+)"/.exec(html)?.[1] ?? 0);
  },
});

ws.close();
