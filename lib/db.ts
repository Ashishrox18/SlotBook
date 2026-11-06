import { Pool, type PoolClient } from "pg";

/**
 * PostgreSQL connection pool.
 *
 * Lazy initialisation: the pool is created on first use so the module can be
 * imported at Next.js build time without DATABASE_URL being present.
 *
 * Each process (app server, migrate, seed) gets its own pool instance.
 * Scripts call pool.end() when they exit; the app server never calls pool.end().
 */

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool || _pool.ending) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See .env.example.");
    }
    // Always enable SSL for external databases (Supabase, RDS, etc.).
    // For local Docker Postgres (localhost) SSL is not available, so skip it.
    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    _pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return _pool;
}

/** Exported pool — callers that need `.connect()` directly (withTransaction) use this. */
export const pool = {
  connect: () => getPool().connect(),
  end: () => getPool().end(),
  query: (...args: Parameters<Pool["query"]>) => (getPool().query as (...a: Parameters<Pool["query"]>) => ReturnType<Pool["query"]>)(...args),
} as unknown as Pool;

export interface QueryResult<T> {
  rows: T[];
  rowCount: number | null;
}

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<QueryResult<unknown>>;
}

function makeSql(q: Queryable) {
  return function sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<QueryResult<T>> {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i++) {
      text += `$${i + 1}` + (strings[i + 1] ?? "");
    }
    return q.query(text, values) as unknown as Promise<QueryResult<T>>;
  };
}

export const sql = makeSql({ query: (text: string, params?: unknown[]) => getPool().query(text, params as never) });
export const sqlFor = (client: PoolClient) => makeSql(client as unknown as Queryable);

export async function dbNow(): Promise<Date> {
  const res = await sql<{ now: Date }>`SELECT now()`;
  return res.rows[0]!.now;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export type { PoolClient };
