// ROast seed — real data from the evening of 5 Nov 2026.
// All prices are the 5 Nov 2026 close. Wipes and re-creates everything.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NOV5 = new Date("2026-11-05T00:00:00");
const d = (s: string) => new Date(`${s}T00:00:00`);

async function main() {
  // Wipe (children first).
  await prisma.claimItem.deleteMany();
  await prisma.claim.deleteMany();
  await prisma.portfolioSnapshot.deleteMany();
  await prisma.position.deleteMany();
  await prisma.order.deleteMany();
  await prisma.catalystEvent.deleteMany();
  await prisma.sourceText.deleteMany();
  await prisma.dayNote.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.source.deleteMany();
  await prisma.stock.deleteMany();

  /* ---------- Stocks ---------- */
  const stockData = [
    { symbol: "JUBLFOOD", name: "Jubilant Foodworks", exchange: "NSE", lastClose: 456.5 },
    { symbol: "ZENSARTECH", name: "Zensar Technologies", exchange: "NSE", lastClose: 565.75 },
    { symbol: "ASHOKLEY", name: "Ashok Leyland", exchange: "NSE", lastClose: 170.21 },
    { symbol: "TECHNOE", name: "Techno Electric", exchange: "NSE", lastClose: 942.75 },
    { symbol: "HBLENGINE", name: "HBL Engineering", exchange: "NSE", lastClose: 855.2 },
    { symbol: "PNGJL", name: "PN Gadgil Jewellers", exchange: "NSE", lastClose: 600.9 },
    { symbol: "DEVYANI", name: "Devyani International", exchange: "NSE", lastClose: 129.21 },
    { symbol: "NYKAA", name: "Nykaa", exchange: "NSE", lastClose: 350.3 },
    { symbol: "GROWW", name: "Groww (Billionbrains)", exchange: "NSE", lastClose: 223.89 },
    { symbol: "ATHER", name: "Ather Energy", exchange: "NSE", lastClose: 1778.6 },
    { symbol: "PREMIERENE", name: "Premier Energies", exchange: "NSE", lastClose: 882.5 },
    { symbol: "STALLION", name: "Stallion India Fluorochemicals", exchange: "NSE", lastClose: 204.3 },
    { symbol: "NIFTY", name: "NIFTY 50", exchange: "INDEX", lastClose: 24536.6 },
  ];
  const stocks: Record<string, number> = {};
  for (const s of stockData) {
    const row = await prisma.stock.create({ data: { ...s, closeDate: NOV5 } });
    stocks[s.symbol] = row.id;
  }

  /* ---------- Sources ---------- */
  const gemini = await prisma.source.create({ data: { name: "Gemini", kind: "AI" } });
  const hanu = await prisma.source.create({ data: { name: "Hanu", kind: "AI" } });
  const ronak = await prisma.source.create({ data: { name: "Ronak", kind: "HUMAN" } });

  /* ---------- Portfolios ---------- */
  const geminiPf = await prisma.portfolio.create({
    data: {
      name: "Gemini",
      ownerSourceId: gemini.id,
      startingCash: 100000,
      cash: 30000, // 7 picks × ₹10,000 deployed
      sizingRule: "FIXED",
    },
  });
  const geminiPicks: Array<[string, number]> = [
    ["JUBLFOOD", 456.5],
    ["ZENSARTECH", 565.75],
    ["ASHOKLEY", 170.21],
    ["TECHNOE", 942.75],
    ["HBLENGINE", 855.2],
    ["PNGJL", 600.9],
    ["DEVYANI", 129.21],
  ];
  for (const [symbol, entry] of geminiPicks) {
    await prisma.position.create({
      data: {
        portfolioId: geminiPf.id,
        stockId: stocks[symbol],
        units: 10000 / entry,
        entryPrice: entry,
        entryDate: NOV5,
      },
    });
  }

  const hanuPf = await prisma.portfolio.create({
    data: {
      name: "Hanu",
      ownerSourceId: hanu.id,
      startingCash: 100000,
      cash: 90000,
      sizingRule: "FIXED",
    },
  });
  await prisma.position.create({
    data: {
      portfolioId: hanuPf.id,
      stockId: stocks["NYKAA"],
      units: 10000 / 350.3,
      entryPrice: 350.3,
      entryDate: NOV5,
      targetPrice: 400, // mid of the 385–415 zone
      exitPrice: 340,
    },
  });

  const realPf = await prisma.portfolio.create({
    data: {
      name: "Ronak (real)",
      ownerSourceId: ronak.id,
      isReal: true,
      startingCash: 24856.3,
      cash: 0,
    },
  });
  const realPositions: Array<[string, number, number, string | null]> = [
    ["GROWW", 40, 219.65, null],
    ["ATHER", 4, 1659.95, null],
    ["PREMIERENE", 6, 890.85, "SELL DECIDED"],
    ["STALLION", 20, 204.27, "HOLD TILL DEC"],
  ];
  for (const [symbol, units, entry, tag] of realPositions) {
    await prisma.position.create({
      data: {
        portfolioId: realPf.id,
        stockId: stocks[symbol],
        units,
        entryPrice: entry,
        entryDate: NOV5,
        tag,
      },
    });
  }

  /* ---------- Pending order (My Desk) ---------- */
  await prisma.order.create({
    data: {
      stockId: stocks["NYKAA"],
      qty: 10,
      limitPrice: 350.3,
      targetLow: 385,
      targetHigh: 415,
      exitPrice: 340,
      status: "PLACED",
    },
  });

  /* ---------- Claims ---------- */
  type ClaimSeed = {
    sourceId: number;
    symbol: string;
    portfolioId: number;
    claimText: string;
    quoteSentence: string;
    due: string;
    items: Array<[string, string]>;
  };
  const claims: ClaimSeed[] = [
    {
      sourceId: gemini.id,
      symbol: "ASHOKLEY",
      portfolioId: geminiPf.id,
      claimText: "October CV sales rose 23% YoY; Q2 results on 14 Nov will push the stock up.",
      quoteSentence: "October CV sales rose 23% YoY; Q2 results on 14 Nov will push the stock up.",
      due: "2026-11-14",
      items: [
        ["Sales news is real (official filing)", "VERIFIED"],
        ["Results land on 14 Nov", "PENDING"],
        ["Price up by verdict date", "PENDING"],
      ],
    },
    {
      sourceId: gemini.id,
      symbol: "JUBLFOOD",
      portfolioId: geminiPf.id,
      claimText: "Q2 results on 6 Nov will lift the stock.",
      quoteSentence: "Q2 results on 6 Nov will lift the stock.",
      due: "2026-11-06",
      items: [
        ["Results land on 6 Nov", "PENDING"],
        ["Price reacts up after results", "PENDING"],
      ],
    },
    {
      sourceId: gemini.id,
      symbol: "HBLENGINE",
      portfolioId: geminiPf.id,
      claimText: "Kavach order momentum; Q2 results 7 Nov.",
      quoteSentence: "Kavach order momentum; Q2 results 7 Nov.",
      due: "2026-11-07",
      items: [
        ["Results land on 7 Nov", "PENDING"],
        ["Price up by verdict date", "PENDING"],
      ],
    },
    {
      sourceId: gemini.id,
      symbol: "TECHNOE",
      portfolioId: geminiPf.id,
      claimText: "Order book ~₹11,000 cr; Q2 results 12 Nov re-rate.",
      quoteSentence: "Order book ~₹11,000 cr; Q2 results 12 Nov re-rate.",
      due: "2026-11-12",
      items: [
        ["Order book claim is on record", "PENDING"],
        ["Results land on 12 Nov", "PENDING"],
        ["Price re-rates after results", "PENDING"],
      ],
    },
    {
      sourceId: hanu.id,
      symbol: "NYKAA",
      portfolioId: hanuPf.id,
      claimText:
        "Q2 PAT +197% YoY print (4 Nov) was sold into; rally toward ₹385–415 next sessions, exit below ₹340.",
      quoteSentence:
        "Q2 PAT +197% YoY print (4 Nov) was sold into; rally toward ₹385–415 next sessions, exit below ₹340.",
      due: "2026-11-19",
      items: [
        ["Q2 print is real (PAT +197% YoY)", "VERIFIED"],
        ["Target zone 385–415 reached", "PENDING"],
        ["Stays above the ₹340 exit line", "PENDING"],
      ],
    },
  ];
  for (const c of claims) {
    await prisma.claim.create({
      data: {
        sourceId: c.sourceId,
        stockId: stocks[c.symbol],
        portfolioId: c.portfolioId,
        claimText: c.claimText,
        quoteSentence: c.quoteSentence,
        dueDate: d(c.due),
        items: { create: c.items.map(([label, state]) => ({ label, state })) },
      },
    });
  }

  // The receipts: the evening's source texts, verbatim by design.
  await prisma.sourceText.create({
    data: {
      sourceId: gemini.id,
      title: "Gemini — rally & doubler picks, 5 Nov 2026",
      body: "Rally picks: Jubilant Foodworks, Zensar Technologies, Ashok Leyland, Techno Electric. Doublers: HBL Engineering, PN Gadgil Jewellers, Devyani International. Ashok Leyland: October CV sales rose 23% YoY; Q2 results on 14 Nov will push the stock up. Jubilant Foodworks: Q2 results on 6 Nov will lift the stock. HBL Engineering: Kavach order momentum; Q2 results 7 Nov. Techno Electric: Order book ~₹11,000 cr; Q2 results 12 Nov re-rate.",
    },
  });
  await prisma.sourceText.create({
    data: {
      sourceId: hanu.id,
      title: "Hanu — post-results pattern call, 5 Nov 2026",
      body: "Nykaa: Q2 PAT +197% YoY print (4 Nov) was sold into; rally toward ₹385–415 next sessions, exit below ₹340.",
    },
  });

  /* ---------- Catalyst events ---------- */
  const events: Array<[string, string | null, string, string]> = [
    ["2026-11-06", "JUBLFOOD", "Jubilant Foodworks Q2 results", "RESULTS"],
    ["2026-11-07", "HBLENGINE", "HBL Engineering Q2 results", "RESULTS"],
    ["2026-11-12", "TECHNOE", "Techno Electric Q2 results", "RESULTS"],
    ["2026-11-14", "ASHOKLEY", "Ashok Leyland Q2 results", "RESULTS"],
    ["2026-11-14", "STALLION", "Stallion Q2 results due (approx)", "RESULTS"],
    ["2026-12-07", null, "SEBI CAS rule goes live", "REGULATORY"],
    ["2026-12-01", "ATHER", "Ather November sales data (early Dec)", "DATA"],
  ];
  for (const [date, symbol, title, kind] of events) {
    await prisma.catalystEvent.create({
      data: { date: d(date), stockId: symbol ? stocks[symbol] : null, title, kind },
    });
  }

  /* ---------- Rules & day note ---------- */
  const rules = [
    "No buy without a target and an exit written first",
    "±7% in a day / ±12% over 3 sessions = alert lines",
    "A missed limit is never chased",
    "Stallion is the one long-term exception, till Dec 2026",
    "The watch alerts only on major moves — no daily noise",
  ];
  for (const text of rules) await prisma.rule.create({ data: { text } });

  await prisma.dayNote.create({
    data: {
      date: NOV5,
      text: "Premier sell decided for tomorrow. Nykaa limit order placed @ 350.30. Gemini's 7 picks entered the league.",
    },
  });

  /* ---------- Baseline snapshots (5 Nov 2026) ---------- */
  // The equity curves start here: one PortfolioSnapshot per portfolio,
  // computed exactly the way src/lib/stats.ts computes live values.
  const allPf = await prisma.portfolio.findMany({
    include: { positions: { include: { stock: true } } },
  });
  for (const p of allPf) {
    const open = p.positions.filter((x) => x.status === "OPEN");
    const invested = open.reduce((s, x) => s + x.units * x.entryPrice, 0);
    const market = open.reduce((s, x) => s + x.units * (x.stock.lastClose ?? 0), 0);
    const totalValue = p.isReal ? market : p.cash + market;
    const base = p.isReal ? invested : p.startingCash;
    await prisma.portfolioSnapshot.create({
      data: {
        portfolioId: p.id,
        date: NOV5,
        totalValue,
        returnPct: base > 0 ? ((totalValue - base) / base) * 100 : 0,
        niftyClose: 24536.6,
      },
    });
  }

  console.log("ROast seed complete: 13 stocks, 3 portfolios, 5 claims, 7 events, 3 baseline snapshots.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
