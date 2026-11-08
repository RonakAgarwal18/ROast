// Rule-based analysis parser — no external AI calls.
// It looks for: known stock names/symbols, BUY/SELL intent words, ₹ amounts
// near entry/target/exit words, and dates like "14 Nov" / "14 Nov 2026".
// The output is a DRAFT — the user edits the preview before anything is saved.

export type ParsedPosition = {
  stockId: number;
  symbol: string;
  name: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number | null;
  exitPrice: number | null;
  plannedAmount?: number | null; // day-contest picks carry their own ₹ size
};

export type ParsedClaim = {
  stockId: number;
  symbol: string;
  claimText: string;
  quoteSentence: string;
  dueDate: string; // ISO date
};

export type ParseResult = {
  positions: ParsedPosition[];
  claims: ParsedClaim[];
  contest?: boolean; // the paste is a day-contest portfolio (open → close)
  contestDue?: string; // ISO date the contest day is judged on
};

type StockLite = { id: number; symbol: string; name: string; lastClose: number | null };

/**
 * Does this sentence name the stock? Full company names match
 * case-insensitively; symbols must appear as typed (UPPERCASE) — with a
 * full exchange master loaded, a case-insensitive symbol match would
 * "detect" stocks from ordinary words (ACE, IDEA, MORE…).
 */
function mentions(sentence: string, stock: StockLite): boolean {
  return (
    sentence.toLowerCase().includes(stock.name.toLowerCase()) ||
    new RegExp(`\\b${stock.symbol}\\b`).test(sentence)
  );
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First date mentioned in a sentence → ISO string (defaults: +14 days). */
function findDate(sentence: string, fallback: Date): string {
  const m = sentence.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{4})?/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? parseInt(m[3], 10) : fallback.getFullYear();
    const d = new Date(year, month, day);
    if (!m[3] && d < fallback) d.setFullYear(year + 1); // "14 Nov" said in Dec means next year
    return d.toISOString().slice(0, 10);
  }
  const rel = sentence.match(/in\s+(\d{1,2})\s*(days|weeks)/i);
  if (rel) {
    const n = parseInt(rel[1], 10) * (rel[2].toLowerCase() === "weeks" ? 7 : 1);
    const d = new Date(fallback);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const fb = new Date(fallback);
  fb.setDate(fb.getDate() + 14);
  return fb.toISOString().slice(0, 10);
}

/** ₹ amount following one of the keywords inside a sentence, if any. */
function amountNear(sentence: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const re = new RegExp(`${kw}[^₹\\d]{0,24}(?:₹|Rs\\.?)?\\s*([\\d,]+(?:\\.\\d+)?)`, "i");
    const m = sentence.match(re);
    if (m) return parseFloat(m[1].replace(/,/g, ""));
  }
  return null;
}

/** Sentences that read like checkable claims (numbers, dates, catalysts). */
function looksLikeClaim(sentence: string): boolean {
  return (
    /\d/.test(sentence) &&
    /(results|sales|profit|pat|revenue|order|results on|by|target|toward|towards|rally|reach|nov|dec|jan|feb|q[1-4]|%|crore|cr\b)/i.test(sentence)
  );
}

const CONTEST_LINE =
  /^\s*\d+\s*[.)]\s+([A-Z][A-Z0-9.&-]{1,24})\s*[—–-]\s*(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)\s*[—–-]\s*(.+)$/;

export function parseAnalysis(
  text: string,
  stocks: StockLite[],
  today: Date = new Date()
): ParseResult {
  // 0) Day-contest format (the super prompt's reply shape): numbered
  // lines carrying symbol + ₹ allocation + the AI's reasoning. When a
  // paste is a contest portfolio, positions come from those lines alone
  // — booked at the next session's open, sold at its close — and each
  // pick's claims come from its own reasoning.
  const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));
  const picks: Array<{ stock: StockLite; amount: number; reasoning: string }> = [];
  for (const line of text.split(/\n+/)) {
    const m = line.match(CONTEST_LINE);
    if (!m) continue;
    const stock = bySymbol.get(m[1]);
    const amount = parseFloat(m[2].replace(/,/g, ""));
    if (stock && amount > 0) picks.push({ stock, amount, reasoning: m[3].trim() });
  }
  if (picks.length > 0) {
    const due = new Date(today);
    due.setDate(due.getDate() + 1);
    const contestDue = due.toISOString().slice(0, 10);
    const positions: ParsedPosition[] = picks.map((pk) => ({
      stockId: pk.stock.id,
      symbol: pk.stock.symbol,
      name: pk.stock.name,
      action: "BUY",
      entryPrice: pk.stock.lastClose ?? 0,
      targetPrice: null,
      exitPrice: null,
      plannedAmount: pk.amount,
    }));
    const claims: ParsedClaim[] = [];
    // The sentence that carries the expected move ("…should drive a
    // 9–14% open-to-close expansion") is the claim that decides the
    // contest — rank it first; the strongest factual sentence rides
    // along as the second claim.
    const moveScore = (x: string) =>
      (/\d+\s*[-–]\s*\d+\s*%/.test(x) ? 2 : 0) + (/expect|should|targets?/i.test(x) ? 1 : 0);
    for (const pk of picks) {
      const sents = splitSentences(pk.reasoning);
      const checkable = sents.filter((x) => looksLikeClaim(x));
      const move = [...checkable].sort((a, b) => moveScore(b) - moveScore(a))[0];
      const rest = checkable.filter((x) => x !== move);
      const chosen = [move, rest[0]].filter(Boolean) as string[];
      if (chosen.length === 0 && sents.length > 0) chosen.push(sents[0]);
      for (const sent of chosen) {
        claims.push({
          stockId: pk.stock.id,
          symbol: pk.stock.symbol,
          claimText: sent.replace(/\s+/g, " ").slice(0, 240),
          quoteSentence: sent.slice(0, 300),
          dueDate: contestDue,
        });
      }
    }
    return { positions, claims, contest: true, contestDue };
  }

  const sentences = splitSentences(text);
  const lower = text.toLowerCase();

  // 1) Which stocks are mentioned at all (longest names first to avoid partial hits).
  const mentioned = stocks
    .filter((s) => lower.includes(s.name.toLowerCase()) || mentions(text, s))
    .sort((a, b) => b.name.length - a.name.length);

  const positions: ParsedPosition[] = [];
  const claims: ParsedClaim[] = [];

  // Attribute every sentence to the most recently named stock — analyses
  // (and the Prompt Kit format) put ENTRY / TARGET / EXIT on the lines
  // AFTER the line that names the stock.
  const owner: Array<StockLite | undefined> = [];
  {
    let cur: StockLite | undefined;
    for (const s of sentences) {
      const named = mentioned.find((st) => mentions(s, st));
      if (named) cur = named;
      owner.push(cur);
    }
  }

  for (const stock of mentioned) {
    const context = sentences.filter((s, i) => owner[i] === stock).join(" ");

    // 2) Intent: default BUY unless sell/exit language dominates the stock's sentences.
    const action: "BUY" | "SELL" =
      /\b(sell|exit|avoid|book profit)/i.test(context) && !/\b(buy|accumulate|add)\b/i.test(context)
        ? "SELL"
        : "BUY";

    const entry =
      amountNear(context, ["buy at", "entry", "enter at", "@", "cmp", "around", "near"]) ??
      stock.lastClose ??
      0; // 0 = no close on record; the preview asks the user to type the entry
    const target = amountNear(context, ["target", "tgt", "upside to", "toward", "towards"]);
    const exit = amountNear(context, ["exit below", "stop", "stoploss", "stop loss", "exit at", "below"]);

    positions.push({
      stockId: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      action,
      entryPrice: entry,
      targetPrice: target,
      exitPrice: exit,
    });

  }

  // 3) Claims: scan sentences in order, attributing each checkable sentence
  //    to the stock it names — or to the stock named most recently before it
  //    ("October CV sales rose 23%…" right after an Ashok Leyland sentence is
  //    an Ashok Leyland claim). Capped at 2 per stock.
  const byStock = new Map<number, number>();
  let current: StockLite | undefined;
  for (const s of sentences) {
    const named = mentioned.find((st) => mentions(s, st));
    if (named) current = named;
    if (!current || !looksLikeClaim(s)) continue;
    const count = byStock.get(current.id) ?? 0;
    if (count >= 2) continue;
    byStock.set(current.id, count + 1);
    claims.push({
      stockId: current.id,
      symbol: current.symbol,
      claimText: s.replace(/\s+/g, " ").slice(0, 240),
      quoteSentence: s.slice(0, 300),
      dueDate: findDate(s, today),
    });
  }

  return { positions, claims };
}
