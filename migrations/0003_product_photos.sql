-- Product photos. The files are in R2 (binding MEDIA); each row is one photo with 1–3 renditions, stored as
-- {key}-{side}.webp for each long side in `sizes`. See src/lib/photos.ts.

CREATE TABLE product_photos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  -- 0 is the main photo. Kept 0..n-1 without gaps; not unique, so two photos can swap in one UPDATE.
  position INTEGER NOT NULL CHECK (position >= 0),
  -- products/{productId}/{first 16 hex characters of the SHA-256 of the largest rendition}
  key TEXT NOT NULL,
  -- Long sides stored, smallest first, e.g. '400,900,1800'.
  sizes TEXT NOT NULL,
  -- Bulgarian; empty means the storefront uses the product name.
  alt TEXT NOT NULL DEFAULT '',
  -- Of the largest rendition.
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX product_photos_product ON product_photos (product_id, position);
CREATE UNIQUE INDEX product_photos_key ON product_photos (product_id, key);
