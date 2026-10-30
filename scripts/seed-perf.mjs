// Writes SQL for a LOCAL performance database: the slice 1 mix of 500 published products and 1,000 variants
// (300 with one variant, 100 with two, 100 with five; 200 of them in 40 series of five), plus 1,000 orders
// with 1-3 items each. Usage:
//   node scripts/seed-perf.mjs > /tmp/perf.sql
//   npx wrangler d1 execute karniktochi --local --file /tmp/perf.sql
// Only ever run it against a throwaway local database (a scratch worktree's .wrangler state): it deletes
// every product, variant, stock row and order first. Never use --remote.

const categories = ['gotvarski', 'malki', 'kamani', 'poddrazhka'];
const kinds = ['Гюто', 'Сантоку', 'Петти', 'Накири', 'Бунка', 'Суджихики', 'Камък', 'Дъска'];
const brands = ['Шибата', 'Такамура', 'Тоджиро', 'Масакаге', 'Мисоно', 'Naniwa'];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = [];
const rows = (table, cols, values) => {
  // Small INSERTs: D1 limits a statement's length and bound variables.
  for (let i = 0; i < values.length; i += 50) {
    out.push(`INSERT INTO ${table} (${cols}) VALUES\n  ${values.slice(i, i + 50).join(',\n  ')};`);
  }
};

out.push('DELETE FROM order_items;', 'DELETE FROM orders;', 'DELETE FROM stock;', 'DELETE FROM variants;', 'DELETE FROM products;');

const products = [];
const variants = [];
const stock = [];
let v = 0;
for (let i = 0; i < 500; i++) {
  const n = i < 300 ? 1 : i < 400 ? 2 : 5;
  const id = `perf-${String(i).padStart(3, '0')}`;
  const kind = kinds[i % kinds.length];
  const brand = brands[i % brands.length];
  const series = i >= 300 ? '' : i < 200 ? `series-${Math.floor(i / 5)}` : '';
  const created = new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString().replace('.000', '');
  products.push(
    `(${q(id)}, ${q(`${kind} ${brand} ${i}`)}, ${q(brand)}, ${q(categories[i % 4])}, ${q(kind)}, 'VG-10', 210, 'Дърво', 180, ` +
      `${q('Кратко описание на продукта.')}, ${q('Описание.\nВтори ред.')}, ${q(series)}, 'published', ` +
      `${q(n > 1 ? 'Length' : '')}, ${q(n > 1 ? 'Дължина' : '')}, ${q(created)}, ${q(created)})`,
  );
  for (let k = 0; k < n; k++) {
    const vid = `pv-${String(v++).padStart(4, '0')}`;
    const value = n > 1 ? `${150 + k * 30} мм` : '';
    const key = n > 1 ? `${150 + k * 30}-mm` : '1';
    variants.push(`(${q(vid)}, ${q(id)}, ${k}, ${q(value)}, ${q(key)}, ${q(`SKU-${vid}`)}, ${9900 + k * 2000 + i})`);
    stock.push(`(${q(vid)}, ${(i * 7 + k) % 12})`);
  }
}
rows('products', 'id, name, brand, category, type, steel, blade_length_mm, handle, weight_g, summary, description, series, status, option_name, option_label, created_at, updated_at', products);
rows('variants', 'id, product_id, position, option_value, option_key, sku, price_cents', variants);
rows('stock', 'variant_id, quantity', stock);

const statuses = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refused'];
const orders = [];
const items = [];
for (let o = 1; o <= 1000; o++) {
  const n = 1 + (o % 3);
  let total = 0;
  for (let k = 0; k < n; k++) {
    const vi = (o * 37 + k * 101) % 1000;
    const price = 9900 + vi;
    total += price;
    items.push(`(${o}, ${q(`pv-${String(vi).padStart(4, '0')}`)}, NULL, ${q(`Продукт ${vi}`)}, '', ${price}, 1)`);
  }
  const created = new Date(Date.UTC(2026, 9, 1) + o * 600_000).toISOString().replace('.000', '');
  orders.push(
    `(${o}, ${q(o.toString(16).padStart(32, '0'))}, ${q(statuses[o % 6])}, ${q(`Клиент ${o}`)}, '+359888${String(o).padStart(6, '0')}', ` +
      `${o % 3 ? 'NULL' : q(`client${o}@example.com`)}, 'София', ${q(o % 2 ? 'office' : 'address')}, ${q('Еконт, офис Лозенец')}, '', ` +
      `${q(o % 4 ? 'cod' : 'bank_transfer')}, ${total}, ${q(created)}, ${q(created)})`,
  );
}
rows('orders', 'id, public_id, status, customer_name, phone, email, city, delivery_method, delivery_details, customer_note, payment_method, total_cents, created_at, updated_at', orders);
rows('order_items', 'order_id, variant_id, product_id, name, option_label, unit_price_cents, quantity', items);

console.log(out.join('\n'));
