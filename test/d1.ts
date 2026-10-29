import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const migrations = () => readdirSync('migrations').sort();

/** Applies the migration files in order, from the one after `after` (or the first) up to and including `upTo`. */
export async function migrate(db: D1Database, { after, upTo }: { after?: string; upTo?: string } = {}) {
  const files = migrations();
  const from = after ? files.indexOf(after) + 1 : 0;
  const to = upTo ? files.indexOf(upTo) + 1 : files.length;
  for (const file of files.slice(from, to)) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--.*$/gm, '');
    for (const stmt of sql.split(';').map((s: string) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
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
