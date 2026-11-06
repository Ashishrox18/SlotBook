export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await sql`SELECT 1 AS ok`;
    const now = await sql<{ now: Date }>`SELECT now()`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      server_time: now.rows[0]!.now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", database: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
