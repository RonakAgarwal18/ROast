"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { parseAnalysis } from "./parser";
import { parseBhavcopyCsv, applyBhavcopy, writeSnapshots } from "./prices";

// All mutations live here as Server Actions. Forms post straight to these.

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

export async function addPosition(formData: FormData) {
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

  // Either explicit units, or a ₹ amount to deploy (fractional units allowed).
  let units = parseFloat(unitsRaw);
  if (!units && amountRaw) units = parseFloat(amountRaw) / entryPrice;
  if (!units) return;

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
    };
  });
  const rawClaims = (payload.claims ?? []) as Array<Record<string, unknown>>;
  const mergedClaims = rawClaims.map((claim, i) =>
    hasPosFields ? { ...claim, include: formData.get(`claim_${i}_include`) === "on" } : claim
  );

  for (const pos of mergedPositions) {
    if (pos.include === false) continue;
    const entryPrice = Number(pos.entryPrice);
    if (!entryPrice) continue;
    const units = fixedAmount / entryPrice;
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
    cash -= fixedAmount;
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
  const claimId = parseInt(String(formData.get("claimId")), 10);
  const verdict = String(formData.get("verdict"));
  if (!claimId || !verdict) return;
  await prisma.claim.update({ where: { id: claimId }, data: { verdict: verdict as never } });
  revalidatePath("/checklists");
  revalidatePath("/records");
  revalidatePath("/league");
}

export async function cycleItemState(formData: FormData) {
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
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await prisma.dayNote.create({ data: { date: new Date(), text } });
  revalidatePath("/my-desk");
}

export async function updateStockClose(formData: FormData) {
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
  revalidatePath("/league");
  revalidatePath("/portfolios");
  revalidatePath("/my-desk");
  redirect(
    `/admin?updated=${res.updated}&date=${res.date}&kind=${res.kind}&snapshots=${res.snapshots}`
  );
}

export async function snapshotNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const n = await writeSnapshots(iso);
  revalidatePath("/league");
  revalidatePath("/portfolios");
  redirect(`/admin?snapped=${n}&date=${iso}`);
}
