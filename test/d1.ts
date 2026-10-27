import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

/** A fresh in-memory D1 database with all migrations applied. */
export async function freshDb() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: 'export default {}', d1Databases: ['DB'] }),
  );
  const db = (await mf.getD1Database('DB')) as unknown as D1Database;
  for (const file of readdirSync('migrations').sort()) {
    const sql = readFileSync(`migrations/${file}`, 'utf8').replace(/--.*$/gm, '');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
  return { db, dispose: () => mf.dispose() };
}
