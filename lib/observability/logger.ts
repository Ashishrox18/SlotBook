type Level = "info" | "warn" | "error" | "debug";

/**
 * PII-safe structured logger. Guest email and name are never logged.
 * All output is one JSON line per event for grep/ingest compatibility.
 */

const PII_FIELDS = new Set(["guest_email", "guest_name", "email", "name"]);

function redactPii(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = PII_FIELDS.has(k) ? "[redacted]" : v;
  }
  return out;
}

function line(level: Level, msg: string, fields?: Record<string, unknown>): string {
  const base: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  return JSON.stringify(fields ? { ...base, ...redactPii(fields) } : base);
}

export const logger = {
  info: (msg: string, fields?: Record<string, unknown>) => console.log(line("info", msg, fields)),
  warn: (msg: string, fields?: Record<string, unknown>) => console.warn(line("warn", msg, fields)),
  error: (msg: string, fields?: Record<string, unknown>) => console.error(line("error", msg, fields)),
  debug: (msg: string, fields?: Record<string, unknown>) => {
    if (process.env.DEBUG) console.log(line("debug", msg, fields));
  },
};

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
