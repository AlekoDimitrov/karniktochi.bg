-- Live stock. A row is created from the product file's `stock` the first time the product is ordered;
-- after that this table is the source of truth (change it from /admin).
-- The CHECK makes any statement that would oversell fail, which rolls back the whole batch.
CREATE TABLE stock (
  product_id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL,
  CONSTRAINT stock_nonnegative CHECK (quantity >= 0)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Unguessable id used in the thank-you page URL.
  public_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'new',
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('office', 'address')),
  -- Courier office name or street address, depending on delivery_method.
  delivery_details TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CONSTRAINT valid_status CHECK (status IN ('new', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refused'))
);

CREATE INDEX orders_status_created ON orders (status, created_at);

CREATE TABLE order_items (
  order_id INTEGER NOT NULL REFERENCES orders (id),
  product_id TEXT NOT NULL,
  -- Name and price as they were when the order was placed.
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);
