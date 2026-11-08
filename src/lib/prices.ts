// The price pipeline — one code path, three doors:
//   1. scripts/update-prices.ts downloads the official exchange bhavcopy
//      files and feeds them here.
//   2. The /admin "Update prices" upload feeds a bhavcopy CSV here.
//   3. writeSnapshots() freezes every portfolio's value for a day.
//
// Everything settles on daily closes. applyBhavcopyCsv() detects which
// exchange format it was handed (NSE full bhavdata, legacy NSE cm file,
// BSE UDiFF, or the NSE index close file) from the header row, updates
// Stock.lastClose / prevClose / closeDate, then writes the day's
// PortfolioSnapshot rows.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { portfolioRows } from "./stats";

/* ---------------- CSV parsing ---------------- */

/** Minimal RFC-4180-ish CSV parser (quotes, embedded commas, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toUpperCase());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
}

/* ---------------- Format detection ---------------- */

export type PriceRow = { symbol: string; close: number; prevClose: number | null; open: number | null };
export type IndexRow = { symbol: string; close: number };

const num = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

/** Company-name normaliser for the BSE name-matching fallback. */
function normName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LIMITED|LTD|LIMITD|LIMITE|THE|AND|&)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedBhavcopy = {
  kind: "NSE" | "BSE" | "BSE_NAME" | "INDEX" | "UNKNOWN";
  prices: PriceRow[];
  index: IndexRow[];
  /** BSE rows keyed by normalised company name (old BSE format has no symbol). */
  byName: Array<{ name: string; close: number; prevClose: number | null }>;
  /** Trading date found inside the file, if any (yyyy-mm-dd). */
  fileDate: string | null;
};

function parseDateCell(v: string | undefined): string | null {
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); // 05-Nov-2026
  if (dmy) {
    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const m = months[dmy[2].toUpperCase()];
    if (m) return `${dmy[3]}-${m}-${dmy[1].padStart(2, "0")}`;
  }
  const dmy2 = v.match(/^(\d{2})-(\d{2})-(\d{4})$/); // 05-11-2026
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`;
  return null;
}

export function parseBhavcopyCsv(text: string): ParsedBhavcopy {
  const rows = parseCsv(text);
  const out: ParsedBhavcopy = { kind: "UNKNOWN", prices: [], index: [], byName: [], fileDate: null };
  if (rows.length === 0) return out;
  const cols = new Set(Object.keys(rows[0]));

  // --- NSE index close file: "Index Name" + "Closing Index Value" ---
  if (cols.has("INDEX NAME") && cols.has("CLOSING INDEX VALUE")) {
    out.kind = "INDEX";
    for (const r of rows) {
      const name = (r["INDEX NAME"] ?? "").toUpperCase();
      const close = num(r["CLOSING INDEX VALUE"]);
      if (close === null) continue;
      const INDEX_SYMBOLS: Record<string, string> = {
        "NIFTY 50": "NIFTY",
        "NIFTY NEXT 50": "NIFTYNEXT50",
        "NIFTY BANK": "NIFTYBANK",
        "NIFTY IT": "NIFTYIT",
        "INDIA VIX": "INDIAVIX",
      };
      const sym = INDEX_SYMBOLS[name];
      if (sym) out.index.push({ symbol: sym, close });
      out.fileDate = out.fileDate ?? parseDateCell(r["INDEX DATE"]);
    }
    return out;
  }

  // --- NSE full bhavdata: SYMBOL + CLOSE_PRICE (+ PREV_CLOSE, DATE1) ---
  if (cols.has("SYMBOL") && cols.has("CLOSE_PRICE")) {
    out.kind = "NSE";
    for (const r of rows) {
      const series = (r["SERIES"] ?? "EQ").toUpperCase();
      if (series !== "EQ" && series !== "BE") continue;
      const close = num(r["CLOSE_PRICE"]);
      if (!r["SYMBOL"] || close === null) continue;
      out.prices.push({ symbol: r["SYMBOL"].toUpperCase(), close, prevClose: num(r["PREV_CLOSE"]), open: num(r["OPEN_PRICE"]) });
      out.fileDate = out.fileDate ?? parseDateCell(r["DATE1"]);
    }
    return out;
  }

  // --- Legacy NSE cm bhavcopy: SYMBOL + CLOSE + PREVCLOSE ---
  if (cols.has("SYMBOL") && cols.has("CLOSE") && cols.has("TIMESTAMP")) {
    out.kind = "NSE";
    for (const r of rows) {
      const series = (r["SERIES"] ?? "EQ").toUpperCase();
      if (series !== "EQ" && series !== "BE") continue;
      const close = num(r["CLOSE"]);
      if (!r["SYMBOL"] || close === null) continue;
      out.prices.push({ symbol: r["SYMBOL"].toUpperCase(), close, prevClose: num(r["PREVCLOSE"]), open: num(r["OPEN"]) });
      out.fileDate = out.fileDate ?? parseDateCell(r["TIMESTAMP"]);
    }
    return out;
  }

  // --- BSE UDiFF: TCKRSYMB + CLSPRIC (equity = FinInstrmTp STK, Sgmt CM) ---
  if (cols.has("TCKRSYMB") && cols.has("CLSPRIC")) {
    out.kind = "BSE";
    for (const r of rows) {
      if (cols.has("FININSTRMTP") && r["FININSTRMTP"] !== "STK") continue;
      if (cols.has("SGMT") && r["SGMT"] !== "CM") continue;
      const close = num(r["CLSPRIC"]);
      if (!r["TCKRSYMB"] || close === null) continue;
      out.prices.push({
        symbol: r["TCKRSYMB"].toUpperCase(),
        close,
        prevClose: num(r["PRVSCLSGPRIC"]),
        open: num(r["OPNPRIC"]),
      });
      out.fileDate = out.fileDate ?? parseDateCell(r["TRADDT"]);
    }
    return out;
  }

  // --- Old BSE format: SC_NAME + CLOSE, no symbol — match by name later ---
  if (cols.has("SC_NAME") && cols.has("CLOSE")) {
    out.kind = "BSE_NAME";
    for (const r of rows) {
      const close = num(r["CLOSE"]);
      if (!r["SC_NAME"] || close === null) continue;
      out.byName.push({ name: normName(r["SC_NAME"]), close, prevClose: num(r["PREVCLOSE"]) });
    }
    return out;
  }

  return out;
}

/* ---------------- Applying prices ---------------- */

export type ApplyResult = {
  kind: ParsedBhavcopy["kind"];
  updated: number;
  date: string; // yyyy-mm-dd the closes belong to
  snapshots: number;
};

/** Midnight-local Date for a yyyy-mm-dd string (matches seed/date handling). */
export function dayDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Update Stock closes from a parsed bhavcopy, then snapshot every
 * portfolio for that date. `dateIso` overrides the file's own date.
 */
export async function applyBhavcopy(
  parsed: ParsedBhavcopy,
  dateIso?: string
): Promise<ApplyResult> {
  const date = dateIso ?? parsed.fileDate ?? todayIso();
  const closeDate = dayDate(date);
  let updated = 0;

  // Collect every stock write first (in the original application order:
  // symbol rows, then name-matched rows, then index rows), then flush
  // them as bulk UPDATE statements (see the flush below). Duplicate
  // writes to the same stock still resolve last-wins, exactly as the
  // original sequential version behaved.
  const pending: Array<{ id: number; close: number; prevClose: number | null; open: number | null }> = [];
  const queue = (stockId: number, close: number, prevClose: number | null, open: number | null = null) => {
    pending.push({ id: stockId, close, prevClose, open });
    updated++;
  };

  if (parsed.prices.length > 0) {
    const stocks = await prisma.stock.findMany({
      where: { symbol: { in: parsed.prices.map((p) => p.symbol) } },
      select: { id: true, symbol: true },
    });
    const bySymbol = new Map(stocks.map((s) => [s.symbol, s.id]));
    for (const row of parsed.prices) {
      const id = bySymbol.get(row.symbol);
      if (id !== undefined) queue(id, row.close, row.prevClose, row.open);
    }
  }

  if (parsed.byName.length > 0) {
    const stocks = await prisma.stock.findMany({ select: { id: true, name: true } });
    const byName = new Map<string, number>();
    for (const s of stocks) {
      const key = normName(s.name);
      if (!byName.has(key)) byName.set(key, s.id);
    }
    for (const row of parsed.byName) {
      const id = byName.get(row.name);
      if (id !== undefined) queue(id, row.close, row.prevClose);
    }
  }

  for (const idx of parsed.index) {
    const stock = await prisma.stock.findUnique({ where: { symbol: idx.symbol } });
    if (stock) queue(stock.id, idx.close, stock.lastClose);
  }

  // Flush as bulk UPDATE…FROM (VALUES …) statements — one statement per
  // chunk instead of one statement per stock. The original chunked
  // transaction of ~5k single-row updates took minutes over the
  // high-latency Vercel→Neon link and timed out the first cron run;
  // this does the same work in ~20 statements. Duplicate ids collapse
  // to their LAST queued write, the same final state the sequential
  // version produced.
  const byId = new Map<number, { close: number; prevClose: number | null; open: number | null }>();
  for (const u of pending) byId.set(u.id, { close: u.close, prevClose: u.prevClose, open: u.open });
  const flushRows = [...byId.entries()];
  const CHUNK = 500;
  for (let i = 0; i < flushRows.length; i += CHUNK) {
    const slice = flushRows.slice(i, i + CHUNK);
    const values = Prisma.join(
      slice.map(
        ([id, v]) => Prisma.sql`(${id}::int, ${v.close}::float8, ${v.prevClose}::float8)`
      )
    );
    await prisma.$executeRaw`
      UPDATE "Stock" AS s
      SET "lastClose" = v.close, "prevClose" = v.prev, "closeDate" = ${closeDate}
      FROM (VALUES ${values}) AS v(id, close, prev)
      WHERE s.id = v.id`;
  }

  // Round 6: record the day's closes into StockClose history (same
  // last-wins rows as the Stock flush above), then prune anything
  // older than ~13 months so the table stays lean.
  for (let i = 0; i < flushRows.length; i += CHUNK) {
    const slice = flushRows.slice(i, i + CHUNK);
    const values = Prisma.join(
      slice.map(
        ([id, v]) => Prisma.sql`(${id}::int, ${closeDate}::timestamp, ${v.close}::float8, ${v.open}::float8)`
      )
    );
    await prisma.$executeRaw`
      INSERT INTO "StockClose" ("stockId", "date", "close", "open")
      SELECT * FROM (VALUES ${values}) AS v(id, d, c, o)
      ON CONFLICT ("stockId", "date") DO UPDATE SET "close" = EXCLUDED."close", "open" = EXCLUDED."open"`;
  }
  const pruneBefore = new Date(closeDate);
  pruneBefore.setDate(pruneBefore.getDate() - 400);
  await prisma.$executeRaw`DELETE FROM "StockClose" WHERE "date" < ${pruneBefore}`;

  const snapshots = await writeSnapshots(date);
  return { kind: parsed.kind, updated, date, snapshots };
}

/**
 * Freeze every portfolio's total value + return for `dateIso`
 * (upsert — re-running a day overwrites that day's row, never duplicates).
 */
export async function writeSnapshots(dateIso: string): Promise<number> {
  const date = dayDate(dateIso);
  const nifty = await prisma.stock.findUnique({ where: { symbol: "NIFTY" } });
  const rows = await portfolioRows();
  await prisma.$transaction(
    rows.map((r) =>
      prisma.portfolioSnapshot.upsert({
        where: { portfolioId_date: { portfolioId: r.id, date } },
        update: { totalValue: r.totalValue, returnPct: r.returnPct, niftyClose: nifty?.lastClose ?? null },
        create: {
          portfolioId: r.id,
          date,
          totalValue: r.totalValue,
          returnPct: r.returnPct,
          niftyClose: nifty?.lastClose ?? null,
        },
      })
    )
  );
  return rows.length;
}
