import { NextResponse } from "next/server";
import { runNightlyPrices } from "@/lib/price-run";

// Nightly price pull, triggered by Vercel Cron (see vercel.json).
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
// env var is set; anything without it is rejected. The work itself is
// src/lib/price-run.ts — the same code as the CLI script and the /admin
// "Run prices now" button.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runNightlyPrices("CRON");
  return NextResponse.json(summary, { status: summary.status === "ERROR" ? 500 : 200 });
}
