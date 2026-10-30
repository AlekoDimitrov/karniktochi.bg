import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const migrations = () => readdirSync('migrations').sort();

/** Runs a SQL file statement by statement (no semicolons or `--` inside string literals). */
export async function runSqlFile(db: D1Database, path: string) {
  const sql = readFileSync(path, 'utf8').replace(/--.*$/gm, '');
  for (const stmt of sql.split(';').map((s: string) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
}

/** Applies the migration files in order, from the one after `after` (or the first) up to and including `upTo`. */
export async function migrate(db: D1Database, { after, upTo }: { after?: string; upTo?: string } = {}) {
  const files = migrations();
  const from = after ? files.indexOf(after) + 1 : 0;
  const to = upTo ? files.indexOf(upTo) + 1 : files.length;
  for (const file of files.slice(from, to)) await runSqlFile(db, `migrations/${file}`);
}

/** Test setup: sets a variant's stock row, creating it if missing (the old admin stock form's upsert). */
export async function setStock(db: D1Database, variantId: string, quantity: number) {
  await db
    .prepare('INSERT INTO stock (variant_id, quantity) VALUES (?, ?) ON CONFLICT (variant_id) DO UPDATE SET quantity = excluded.quantity')
    .bind(variantId, quantity)
    .run();
}

/** A fresh in-memory D1 database with all migrations applied, or only those up to and including `upTo`. */
export async function freshDb(upTo?: string) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: 'export default {}', d1Databases: ['DB'] }),
  );
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  await migrate(db, { upTo });
  return { db, dispose: () => mf.dispose() };
}
