-- Removes the test orders added by scripts/seed-orders.sql from the LOCAL database: `npm run unseed:orders`.
-- Only orders whose public_id starts with "seedorder" are touched.

DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE public_id LIKE 'seedorder%');
DELETE FROM orders WHERE public_id LIKE 'seedorder%';
