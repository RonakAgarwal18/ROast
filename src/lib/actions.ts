"use server";
import { wholeShares } from "@/lib/format";
import { nearestShares } from "@/lib/shares";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { fundSymbol, fundDisplayName, backfillFundHistory } from "./funds";
import { parseAnalysis } from "./parser";
import { parseBhavcopyCsv, applyBhavcopy, writeSnapshots } from "./prices";
import { runNightlyPrices, recordPriceRun } from "./price-run";
import { requireOwner, verifyCredentials, SESSION_COOKIE } from "./auth";
import { createSessionToken } from "./session";

// All mutations live here as Server Actions. Forms post straight to these.
// EVERY action below is owner-only: public read stays open, but writes
// require the owner session (requireOwner redirects to /login when
// logged out). The checks live here, server-side — the /admin proxy
// gate is only a convenience on top.

/* ---------------- Owner login ---------------- */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/admin");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/admin";

  if (!verifyCredentials(email, password)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const token = createSessionToken(email.trim().toLowerCase());
  if (!token) {
    // AUTH_SECRET not configured — login cannot work; fail closed.
    redirect(`/login?error=config&next=${encodeURIComponent(next)}`);
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  redirect(next);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}

async function getOrCreateSource(name: string, kind: string) {
  const clean = name.trim();
  return prisma.source.upsert({
    where: { name: clean },
    update: {},
    create: { name: clean, kind },
  });
}

/* ---------------- Portfolios ---------------- */

export async function createPortfolio(formData: FormData) {
  await requireOwner();
  const name = String(formData.get("name") ?? "").trim();
  const ownerName = String(formData.get("owner") ?? "").trim();
  const ownerKind = String(formData.get("ownerKind") ?? "AI");
  const startingCash = parseFloat(String(formData.get("startingCash") ?? "100000")) || 100000;
  const sizingRule = String(formData.get("sizingRule") ?? "FIXED");
  if (!name || !ownerName) return;

  const source = await getOrCreateSource(ownerName, ownerKind);
  await prisma.portfolio.create({
    data: {
      name,
      ownerSourceId: source.id,
      startingCash,
      cash: startingCash,
      sizingRule,
    },
  });
  revalidatePath("/portfolios");
  revalidatePath("/league");
}

/* ---------------- Positions ---------------- */

/** Modify an UNFILLED (NEXT_OPEN) order's ₹ allocation. The book's
 * cash absorbs the difference; the new amount may not exceed the old
 * allocation plus the cash the book actually has free. Once the order
 * fills at the open it is a normal position and no longer editable. */
export async function updatePlannedAmount(formData: FormData) {
  await requireOwner();
  const positionId = parseInt(String(formData.get("positionId")), 10);
  const newAmount = parseFloat(String(formData.get("plannedAmount") ?? ""));
  if (!positionId || !newAmount || newAmount <= 0) return;
  const pos = await prisma.position.findUnique({
    where: { id: positionId },
    include: { portfolio: true, stock: true },
  });
  if (!pos || pos.status !== "OPEN" || pos.entryMode !== "NEXT_OPEN" || !pos.plannedAmount)
    return;
  const pf = pos.portfolio;
  if (newAmount > pos.plannedAmount + pf.cash) return;
  const est = pos.stock.lastClose
    ? nearestShares(newAmount, pos.stock.lastClose)
    : pos.units;
  await prisma.position.update({
    where: { id: positionId },
    data: { plannedAmount: newAmount, units: est },
  });
  if (!pf.isReal) {
    await prisma.portfolio.update({
      where: { id: pf.id },
      data: { cash: pf.cash + (pos.plannedAmount - newAmount) },
    });
  }
  revalidatePath(`/portfolios/${pf.id}`);
  revalidatePath("/league");
  revalidatePath("/");
}

export async function addPosition(formData: FormData) {
  await requireOwner();
  const portfolioId = parseInt(String(formData.get("portfolioId")), 10);
  const stockId = parseInt(String(formData.get("stockId")), 10);
  const entryPrice = parseFloat(String(formData.get("entryPrice")));
  const unitsRaw = String(formData.get("units") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const entryDate = new Date(String(formData.get("entryDate")));
  const targetPrice = parseFloat(String(formData.get("targetPrice") ?? ""));
  const exitPrice = parseFloat(String(formData.get("exitPrice") ?? ""));
  const tag = String(formData.get("tag") ?? "").trim();
  if (!portfolioId || !stockId || !entryPrice) return;

  // Either explicit units, or a ₹ amount to deploy. Indian equities
  // trade in whole shares only — amounts floor to full shares and the
  // unspent remainder simply stays in the portfolio's cash. Fractional
  // units exist only for mutual funds.
  const stockForUnits = await prisma.stock.findUnique({
    where: { id: stockId },
    select: { exchange: true },
  });
  if (!stockForUnits) return;
  let units = parseFloat(unitsRaw);
  if (!units && amountRaw) units = parseFloat(amountRaw) / entryPrice;
  if (!units) return;
  units = wholeShares(stockForUnits.exchange, units);
  if (units < 1) return;

  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) return;

  await prisma.position.create({
    data: {
      portfolioId,
      stockId,
      units,
      entryPrice,
      entryDate: isNaN(entryDate.getTime()) ? new Date() : entryDate,
      targetPrice: isNaN(targetPrice) ? null : targetPrice,
      exitPrice: isNaN(exitPrice) ? null : exitPrice,
      tag: tag || null,
    },
  });

  if (!portfolio.isReal) {
    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: { cash: portfolio.cash - units * entryPrice },
    });
  }
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/league");
}

export async function closePosition(formData: FormData) {
  await requireOwner();
  const positionId = parseInt(String(formData.get("positionId")), 10);
  const sellPrice = parseFloat(String(formData.get("sellPrice")));
  if (!positionId || !sellPrice) return;

  const pos = await prisma.position.findUnique({
    where: { id: positionId },
    include: { portfolio: true },
  });
  if (!pos) return;

  await prisma.position.update({
    where: { id: positionId },
    data: { status: "CLOSED", sellPrice, sellDate: new Date() },
  });
  if (!pos.portfolio.isReal) {
    await prisma.portfolio.update({
      where: { id: pos.portfolioId },
      data: { cash: pos.portfolio.cash + pos.units * sellPrice },
    });
  }
  revalidatePath(`/portfolios/${pos.portfolioId}`);
  revalidatePath("/records");
  revalidatePath("/league");
}

/* ---------------- Add Analysis (paste → parse → confirm) ---------------- */

export async function parsePaste(formData: FormData) {
  await requireOwner();
  const text = String(formData.get("text") ?? "");
  const sourceName = String(formData.get("sourceName") ?? "").trim();
  const stocks = await prisma.stock.findMany({
    select: { id: true, symbol: true, name: true, lastClose: true },
  });
  const result = parseAnalysis(text, stocks);
  const params = new URLSearchParams({
    draft: Buffer.from(JSON.stringify(result)).toString("base64url"),
    sourceName,
    text,
  });
  redirect(`/add?${params.toString()}`);
}

export async function confirmPaste(formData: FormData) {
  await requireOwner();
  const sourceName = String(formData.get("sourceName") ?? "").trim();
  const sourceKind = String(formData.get("sourceKind") ?? "AI");
  const text = String(formData.get("text") ?? "");
  const portfolioMode = String(formData.get("portfolioMode") ?? "existing");
  const payload = JSON.parse(String(formData.get("payload") ?? "{}"));

  if (!sourceName || !Array.isArray(payload.positions)) return;
  const source = await getOrCreateSource(sourceName, sourceKind);

  // The receipt: the pasted text is stored verbatim, append-only.
  await prisma.sourceText.create({
    data: { sourceId: source.id, title: `Analysis by ${sourceName}`, body: text },
  });

  // Resolve the target portfolio.
  let portfolioId: number;
  if (portfolioMode === "new") {
    const startingCash = parseFloat(String(formData.get("newStartingCash") ?? "100000")) || 100000;
    const p = await prisma.portfolio.create({
      data: {
        name: String(formData.get("newPortfolioName") ?? sourceName).trim() || sourceName,
        ownerSourceId: source.id,
        startingCash,
        cash: startingCash,
      },
    });
    portfolioId = p.id;
  } else {
    portfolioId = parseInt(String(formData.get("portfolioId")), 10);
  }
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) return;

  const fixedAmount = parseFloat(String(formData.get("amountPerPick") ?? "10000")) || 10000;
  let cash = portfolio.cash;

  // The preview renders editable fields (pos_<i>_entry etc.) — when they
  // are present they win over the raw parse payload.
  const hasPosFields = formData.has("posFields");
  const rawPositions = payload.positions as Array<Record<string, unknown>>;
  const mergedPositions = rawPositions.map((pos, i) => {
    if (!hasPosFields) return pos;
    const num = (key: string) => {
      const v = parseFloat(String(formData.get(key) ?? ""));
      return isNaN(v) ? null : v;
    };
    return {
      ...pos,
      include: formData.get(`pos_${i}_include`) === "on",
      entryPrice: num(`pos_${i}_entry`) ?? pos.entryPrice,
      targetPrice: num(`pos_${i}_target`),
      exitPrice: num(`pos_${i}_exit`),
      plannedAmount: num(`pos_${i}_amount`) ?? pos.plannedAmount ?? null,
    };
  });
  const rawClaims = (payload.claims ?? []) as Array<Record<string, unknown>>;
  const mergedClaims = rawClaims.map((claim, i) =>
    hasPosFields ? { ...claim, include: formData.get(`claim_${i}_include`) === "on" } : claim
  );

  const isContest = payload.contest === true;
  for (const pos of mergedPositions) {
    if (pos.include === false) continue;
    const entryPrice = Number(pos.entryPrice);
    if (!entryPrice) continue;
    if (isContest) {
      // Day contest: the pick carries its own ₹ allocation. The position
      // is booked unfilled — the nightly run fills it at the next
      // session's open (units = amount / open) and auto-sells at that
      // session's close. entryPrice/units here are the last close, for
      // display until the fill reprices them.
      const plannedAmount = Number(pos.plannedAmount ?? 0);
      if (!plannedAmount) continue;
      await prisma.position.create({
        data: {
          portfolioId,
          stockId: Number(pos.stockId),
          units: Math.floor(plannedAmount / entryPrice),
          entryPrice,
          entryDate: new Date(),
          entryMode: "NEXT_OPEN",
          exitMode: "DAY_CLOSE",
          plannedAmount,
          tag: "OPEN→CLOSE",
        },
      });
      cash -= plannedAmount;
      continue;
    }
    const stRow = await prisma.stock.findUnique({
      where: { id: Number(pos.stockId) },
      select: { exchange: true },
    });
    const units = wholeShares(stRow?.exchange ?? "NSE", fixedAmount / entryPrice);
    if (units < 1) continue;
    await prisma.position.create({
      data: {
        portfolioId,
        stockId: Number(pos.stockId),
        units,
        entryPrice,
        entryDate: new Date(),
        targetPrice: pos.targetPrice ? Number(pos.targetPrice) : null,
        exitPrice: pos.exitPrice ? Number(pos.exitPrice) : null,
      },
    });
    cash -= units * entryPrice;
  }

  for (const claim of mergedClaims) {
    if (claim.include === false) continue;
    await prisma.claim.create({
      data: {
        sourceId: source.id,
        stockId: Number(claim.stockId),
        portfolioId,
        claimText: String(claim.claimText ?? ""),
        quoteSentence: String(claim.quoteSentence ?? claim.claimText ?? ""),
        dueDate: new Date(String(claim.dueDate)),
        items: {
          create: [{ label: "Claim comes true by the due date", state: "PENDING" }],
        },
      },
    });
  }

  if (!portfolio.isReal) {
    await prisma.portfolio.update({ where: { id: portfolioId }, data: { cash } });
  }
  revalidatePath("/league");
  revalidatePath("/checklists");
  redirect(`/portfolios/${portfolioId}`);
}

/* ---------------- Checklists ---------------- */

export async function setVerdict(formData: FormData) {
  await requireOwner();
  const claimId = parseInt(String(formData.get("claimId")), 10);
  const verdict = String(formData.get("verdict"));
  if (!claimId || !verdict) return;
  await prisma.claim.update({ where: { id: claimId }, data: { verdict: verdict as never } });
  revalidatePath("/checklists");
  revalidatePath("/records");
  revalidatePath("/league");
}

export async function cycleItemState(formData: FormData) {
  await requireOwner();
  const itemId = parseInt(String(formData.get("itemId")), 10);
  if (!itemId) return;
  const item = await prisma.claimItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const order = ["PENDING", "VERIFIED", "FAILED", "NO_RECEIPT"];
  const next = order[(order.indexOf(item.state) + 1) % order.length];
  await prisma.claimItem.update({ where: { id: itemId }, data: { state: next } });
  revalidatePath("/checklists");
}

/* ---------------- My Desk ---------------- */

export async function addDayNote(formData: FormData) {
  await requireOwner();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await prisma.dayNote.create({ data: { date: new Date(), text } });
  revalidatePath("/my-desk");
}

export async function updateStockClose(formData: FormData) {
  await requireOwner();
  const stockId = parseInt(String(formData.get("stockId")), 10);
  const close = parseFloat(String(formData.get("lastClose")));
  if (!stockId || !close) return;
  await prisma.stock.update({
    where: { id: stockId },
    data: { lastClose: close, closeDate: new Date() },
  });
  revalidatePath("/my-desk");
  revalidatePath("/league");
  revalidatePath("/portfolios");
}

/* ---------------- Price pipeline (/admin) ---------------- */

export async function uploadBhavcopy(formData: FormData) {
  await requireOwner();
  const file = formData.get("file");
  const dateRaw = String(formData.get("date") ?? "").trim();
  if (!file || typeof file === "string" || file.size === 0) {
    redirect("/admin?error=nofile");
  }
  const text = await (file as File).text();
  const parsed = parseBhavcopyCsv(text);
  if (parsed.kind === "UNKNOWN") {
    redirect("/admin?error=format");
  }
  const res = await applyBhavcopy(parsed, /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined);
  await recordPriceRun("ADMIN_UPLOAD", {
    status: "OK",
    tradeDate: res.date,
    updated: res.updated,
    snapshots: res.snapshots,
    message: `Uploaded file (${res.kind})`,
  });
  revalidatePath("/league");
  revalidatePath("/portfolios");
  revalidatePath("/my-desk");
  redirect(
    `/admin?updated=${res.updated}&date=${res.date}&kind=${res.kind}&snapshots=${res.snapshots}`
  );
}

export async function runPricesNow() {
  await requireOwner();
  const s = await runNightlyPrices("ADMIN");
  revalidatePath("/league");
  revalidatePath("/portfolios");
  revalidatePath("/my-desk");
  const params = new URLSearchParams({
    runstatus: s.status,
    runmsg: s.message,
    ...(s.tradeDate ? { rundate: s.tradeDate } : {}),
  });
  redirect(`/admin?${params.toString()}`);
}

export async function snapshotNow() {
  await requireOwner();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const n = await writeSnapshots(iso);
  revalidatePath("/league");
  revalidatePath("/portfolios");
  redirect(`/admin?snapped=${n}&date=${iso}`);
}

/* ---------------- Fix-it tools (Round 5) ----------------
   Correct a wrong entry after the fact. Source texts and claims stay
   append-only (that's the product's integrity rule); positions and
   desk orders are bookkeeping, so they can be fixed. For paper
   portfolios the cash balance is reconciled by the delta between the
   old row's cash effect and the new row's. */

type PosShape = {
  units: number;
  entryPrice: number;
  status: string;
  sellPrice: number | null;
};

function posCashEffect(p: PosShape): number {
  // Net cash impact of a position's existence on a paper portfolio:
  // negative while money is deployed, plus the sell credit once closed.
  const deployed = p.units * p.entryPrice;
  const credited = p.status === "CLOSED" ? p.units * (p.sellPrice ?? 0) : 0;
  return credited - deployed;
}

export async function updatePosition(formData: FormData) {
  await requireOwner();
  const positionId = parseInt(String(formData.get("positionId")), 10);
  if (!positionId) return;
  const pos = await prisma.position.findUnique({
    where: { id: positionId },
    include: { portfolio: true },
  });
  if (!pos) return;

  const num = (key: string, fallback: number | null): number | null => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return null;
    const v = parseFloat(raw);
    return isNaN(v) ? fallback : v;
  };
  const dateOr = (key: string, fallback: Date | null): Date | null => {
    const raw = String(formData.get(key) ?? "").trim();
    const d = raw ? new Date(`${raw}T00:00:00`) : null;
    return d && !isNaN(d.getTime()) ? d : fallback;
  };

  const status = String(formData.get("status") ?? pos.status);
  const next: PosShape & {
    entryDate: Date;
    targetPrice: number | null;
    exitPrice: number | null;
    tag: string | null;
    sellDate: Date | null;
  } = {
    units: num("units", pos.units) ?? pos.units,
    entryPrice: num("entryPrice", pos.entryPrice) ?? pos.entryPrice,
    entryDate: dateOr("entryDate", pos.entryDate) ?? pos.entryDate,
    targetPrice: num("targetPrice", null),
    exitPrice: num("exitPrice", null),
    status: status === "CLOSED" ? "CLOSED" : "OPEN",
    sellPrice: num("sellPrice", null),
    sellDate: dateOr("sellDate", pos.sellDate),
    tag: String(formData.get("tag") ?? "").trim() || null,
  };
  if (next.status === "OPEN") {
    next.sellPrice = null;
    next.sellDate = null;
  }

  await prisma.position.update({
    where: { id: positionId },
    data: {
      units: next.units,
      entryPrice: next.entryPrice,
      entryDate: next.entryDate,
      targetPrice: next.targetPrice,
      exitPrice: next.exitPrice,
      status: next.status as never,
      sellPrice: next.sellPrice,
      sellDate: next.sellDate,
      tag: next.tag,
    },
  });

  if (!pos.portfolio.isReal) {
    const delta = posCashEffect(next) - posCashEffect(pos);
    if (delta !== 0) {
      await prisma.portfolio.update({
        where: { id: pos.portfolioId },
        data: { cash: pos.portfolio.cash + delta },
      });
    }
  }
  revalidatePath(`/portfolios/${pos.portfolioId}`);
  revalidatePath("/records");
  revalidatePath("/league");
}

export async function deletePosition(formData: FormData) {
  await requireOwner();
  const positionId = parseInt(String(formData.get("positionId")), 10);
  if (!positionId) return;
  const pos = await prisma.position.findUnique({
    where: { id: positionId },
    include: { portfolio: true },
  });
  if (!pos) return;

  await prisma.position.delete({ where: { id: positionId } });
  if (!pos.portfolio.isReal) {
    // Undo the position's whole cash effect.
    await prisma.portfolio.update({
      where: { id: pos.portfolioId },
      data: { cash: pos.portfolio.cash - posCashEffect(pos) },
    });
  }
  revalidatePath(`/portfolios/${pos.portfolioId}`);
  revalidatePath("/records");
  revalidatePath("/league");
}

export async function updateOrder(formData: FormData) {
  await requireOwner();
  const orderId = parseInt(String(formData.get("orderId")), 10);
  if (!orderId) return;
  const num = (key: string): number | null => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return null;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  };
  const status = String(formData.get("status") ?? "PLACED");
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) return;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      qty: num("qty") ?? existing.qty,
      limitPrice: num("limitPrice") ?? existing.limitPrice,
      targetLow: num("targetLow"),
      targetHigh: num("targetHigh"),
      exitPrice: num("exitPrice"),
      status: (["PLACED", "FILLED", "CANCELLED", "EXPIRED"].includes(status)
        ? status
        : "PLACED") as never,
    },
  });
  revalidatePath("/my-desk");
}

export async function deleteOrder(formData: FormData) {
  await requireOwner();
  const orderId = parseInt(String(formData.get("orderId")), 10);
  if (!orderId) return;
  await prisma.order.delete({ where: { id: orderId } });
  revalidatePath("/my-desk");
}

/* ---------------- Round 6: Daily Movers causes ---------------- */

export async function setMoverNote(formData: FormData) {
  await requireOwner();
  const dateStr = String(formData.get("date") ?? "");
  const symbol = String(formData.get("symbol") ?? "").toUpperCase().trim();
  const cause = String(formData.get("cause") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!dateStr || !symbol || !cause) return;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  await prisma.moverNote.upsert({
    where: { date_symbol: { date, symbol } },
    update: { cause, sourceUrl: sourceUrl || null },
    create: { date, symbol, cause, sourceUrl: sourceUrl || null },
  });
  revalidatePath("/movers");
}

export async function deleteMoverNote(formData: FormData) {
  await requireOwner();
  const dateStr = String(formData.get("date") ?? "");
  const symbol = String(formData.get("symbol") ?? "").toUpperCase().trim();
  if (!dateStr || !symbol) return;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  await prisma.moverNote.deleteMany({ where: { date, symbol } });
  revalidatePath("/movers");
}

/* ---------------- Round 7: fund benchmarks ---------------- */

export async function addFundBenchmark(formData: FormData) {
  await requireOwner();
  const schemeCode = String(formData.get("schemeCode") ?? "").trim();
  const cashRaw = parseFloat(String(formData.get("cash") ?? "100000"));
  const cash = isNaN(cashRaw) ? 100000 : Math.max(1000, cashRaw);
  const scheme = await prisma.fundScheme.findUnique({ where: { schemeCode } });
  if (!scheme || scheme.nav == null) redirect("/funds?error=unknown-scheme");

  const nav: number = scheme.nav;
  const navDate: Date = scheme.navDate ?? new Date();
  const symbol = fundSymbol(schemeCode);
  const stock = await prisma.stock.upsert({
    where: { symbol },
    update: { lastClose: nav, closeDate: scheme.navDate },
    create: {
      symbol,
      name: fundDisplayName(scheme),
      exchange: "MF",
      lastClose: nav,
      prevClose: null,
      closeDate: scheme.navDate,
    },
  });
  await backfillFundHistory(stock.id, schemeCode);

  const source = await prisma.source.upsert({
    where: { name: "Benchmarks" },
    update: {},
    create: { name: "Benchmarks", kind: "BENCHMARK" },
  });
  const name = `${fundDisplayName(scheme)} — Benchmark`;
  const existing = await prisma.portfolio.findUnique({ where: { name } });
  if (existing) redirect(`/portfolios/${existing.id}`);

  const portfolio = await prisma.portfolio.create({
    data: {
      name,
      ownerSourceId: source.id,
      isReal: false,
      startingCash: cash,
      cash: 0,
      sizingRule: "FIXED",
    },
  });
  await prisma.position.create({
    data: {
      portfolioId: portfolio.id,
      stockId: stock.id,
      units: cash / nav,
      entryPrice: nav,
      entryDate: navDate,
      status: "OPEN",
      tag: "BENCHMARK",
    },
  });
  const p2 = (n: number) => String(n).padStart(2, "0");
  const iso = `${navDate.getFullYear()}-${p2(navDate.getMonth() + 1)}-${p2(navDate.getDate())}`;
  await writeSnapshots(iso);
  revalidatePath("/league");
  revalidatePath("/funds");
  redirect(`/portfolios/${portfolio.id}`);
}
