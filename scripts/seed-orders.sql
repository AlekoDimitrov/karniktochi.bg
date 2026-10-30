-- 120 test orders for the LOCAL database only: `npm run seed:orders` (wrangler d1 execute --local).
-- For clicking through the admin orders list and its pages. Remove them with `npm run unseed:orders`.
--
-- Every test order has a public_id starting with "seedorder" and one item whose variant id
-- ("seed-test-item") has no stock row, so changing a test order's status never changes any real stock.
-- Running it twice adds nothing new.

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 120)
INSERT OR IGNORE INTO orders (public_id, status, customer_name, phone, email, city, delivery_method, delivery_details,
  customer_note, payment_method, total_cents, created_at, updated_at)
SELECT
  printf('seedorder%023d', i),
  CASE i % 6 WHEN 0 THEN 'new' WHEN 1 THEN 'confirmed' WHEN 2 THEN 'shipped' WHEN 3 THEN 'delivered'
    WHEN 4 THEN 'cancelled' ELSE 'refused' END,
  'Тестова поръчка ' || i,
  '+35988800' || printf('%04d', i),
  CASE WHEN i % 3 = 0 THEN 'test' || i || '@example.com' END,
  'София',
  CASE WHEN i % 2 = 0 THEN 'office' ELSE 'address' END,
  CASE WHEN i % 2 = 0 THEN 'Еконт, офис Лозенец' ELSE 'ул. Тестова ' || i END,
  '',
  CASE WHEN i % 4 = 0 THEN 'bank_transfer' ELSE 'cod' END,
  1000 * i,
  strftime('%Y-%m-%dT%H:%M:%SZ', '2026-10-01', '+' || (i * 5) || ' hours'),
  strftime('%Y-%m-%dT%H:%M:%SZ', '2026-10-01', '+' || (i * 5) || ' hours')
FROM n;

INSERT INTO order_items (order_id, variant_id, product_id, name, option_label, unit_price_cents, quantity)
SELECT o.id, 'seed-test-item', 'seed-test-item', 'Тестов продукт', '', o.total_cents, 1
FROM orders o
WHERE o.public_id LIKE 'seedorder%' AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);
