import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, sql } from "../lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal, transparent migration runner.
 * Applies every `*.sql` file in db/migrations that has not yet been recorded
 * in the schema_migrations table, in lexical order, each inside its own transaction.
 */
async function main() {
  const migrationsDir = resolve(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const applied = new Set(
    (await sql`SELECT filename FROM schema_migrations`).rows.map(
      (r) => (r as { filename: string }).filename,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = readFileSync(resolve(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(content);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [
        file,
      ]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[migrate] failed ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log("[migrate] done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
