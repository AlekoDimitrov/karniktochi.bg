-- Products and their variants move from Markdown files into D1.
-- Every product has one option dimension (option_name for the admin, option_label on the storefront)
-- and one or more variants. A product without choices has exactly one variant with option_value ''.
-- Stock, cart lines and order items are keyed by variant id.

CREATE TABLE products (
  -- Slug made from the Bulgarian name; immutable once created.
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('gotvarski', 'malki', 'kamani', 'poddrazhka')),
  type TEXT NOT NULL DEFAULT '',
  steel TEXT NOT NULL DEFAULT '',
  blade_length_mm INTEGER CHECK (blade_length_mm > 0),
  handle TEXT NOT NULL DEFAULT '',
  weight_g INTEGER CHECK (weight_g > 0),
  summary TEXT NOT NULL DEFAULT '',
  -- Plain text with line breaks.
  description TEXT NOT NULL DEFAULT '',
  -- Products with the same series are shown to each other as other models.
  series TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  -- Option name in the admin (English, e.g. Length) and its label on the storefront (e.g. Дължина).
  option_name TEXT NOT NULL DEFAULT '',
  option_label TEXT NOT NULL DEFAULT '',
  -- English texts for later; the storefront ignores them for now.
  name_en TEXT,
  summary_en TEXT,
  description_en TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX products_status_created ON products (status, created_at);

CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  position INTEGER NOT NULL DEFAULT 0,
  -- What the customer picks, e.g. 210 мм. Empty for the single default variant.
  option_value TEXT NOT NULL DEFAULT '',
  -- The option value in the product page URL (?v=210-mm).
  option_key TEXT NOT NULL DEFAULT '',
  sku TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX variants_product ON variants (product_id, position);
CREATE UNIQUE INDEX variants_sku ON variants (sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX variants_option_key ON variants (product_id, option_key) WHERE status = 'active';

-- Stock and order items now refer to variants. The six demo products below get a default variant whose
-- id is the old product id, so existing stock rows, order items and saved carts keep pointing at them.
ALTER TABLE stock RENAME COLUMN product_id TO variant_id;
ALTER TABLE order_items RENAME COLUMN product_id TO variant_id;
ALTER TABLE order_items ADD COLUMN product_id TEXT;
-- Option as it was when the order was placed, e.g. Дължина: 210 мм. Empty for products without choices.
ALTER TABLE order_items ADD COLUMN option_label TEXT NOT NULL DEFAULT '';
UPDATE order_items SET product_id = variant_id;

-- The demo products from src/content/products (removed).
INSERT INTO products (id, name, brand, category, type, steel, blade_length_mm, handle, summary, description, status, is_demo, created_at, updated_at) VALUES
  ('demo-1', 'ДЕМО продукт 1', 'ДЕМО марка', 'gotvarski', 'Гюто', 'Демо стомана', 210, 'Демо дръжка', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z'),
  ('demo-2', 'ДЕМО продукт 2', 'ДЕМО марка', 'gotvarski', 'Сантоку', 'Демо стомана', 180, 'Демо дръжка', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z'),
  ('demo-3', 'ДЕМО продукт 3', 'ДЕМО марка', 'malki', 'Петти', 'Демо стомана', 135, 'Демо дръжка', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-24T00:00:00Z', '2026-10-24T00:00:00Z'),
  ('demo-4', 'ДЕМО продукт 4', 'ДЕМО марка', 'malki', 'Универсален', 'Демо стомана', 150, 'Демо дръжка', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z'),
  ('demo-5', 'ДЕМО продукт 5', 'ДЕМО марка', 'kamani', 'Точилен камък', '', NULL, '', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-22T00:00:00Z', '2026-10-22T00:00:00Z'),
  ('demo-6', 'ДЕМО продукт 6', 'ДЕМО марка', 'poddrazhka', 'Дъска за рязане', '', NULL, '', 'Демонстрационен продукт. Заменете го с истински след като получите стоката.', 'Демонстрационен текст за описание на продукта.', 'published', 1, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z');

INSERT INTO variants (id, product_id, price_cents) VALUES
  ('demo-1', 'demo-1', 12900),
  ('demo-2', 'demo-2', 9800),
  ('demo-3', 'demo-3', 6400),
  ('demo-4', 'demo-4', 5900),
  ('demo-5', 'demo-5', 8500),
  ('demo-6', 'demo-6', 4500);

-- Starting stock from the product files. Rows that already exist hold live counts and are kept.
INSERT INTO stock (variant_id, quantity) VALUES
  ('demo-1', 5), ('demo-2', 3), ('demo-3', 8), ('demo-4', 0), ('demo-5', 4), ('demo-6', 10)
  ON CONFLICT (variant_id) DO NOTHING;
