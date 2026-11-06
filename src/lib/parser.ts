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
};

type StockLite = { id: number; symbol: string; name: string; lastClose: number };

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
    /(results|sales|profit|pat|revenue|order|results on|by|target|nov|dec|jan|feb|q[1-4]|%|crore|cr\b)/i.test(sentence)
  );
}

export function parseAnalysis(
  text: string,
  stocks: StockLite[],
  today: Date = new Date()
): ParseResult {
  const sentences = splitSentences(text);
  const lower = text.toLowerCase();

  // 1) Which stocks are mentioned at all (longest names first to avoid partial hits).
  const mentioned = stocks
    .filter(
      (s) =>
        lower.includes(s.name.toLowerCase()) ||
        new RegExp(`\\b${s.symbol}\\b`, "i").test(text)
    )
    .sort((a, b) => b.name.length - a.name.length);

  const positions: ParsedPosition[] = [];
  const claims: ParsedClaim[] = [];

  for (const stock of mentioned) {
    const mine = sentences.filter(
      (s) =>
        s.toLowerCase().includes(stock.name.toLowerCase()) ||
        new RegExp(`\\b${stock.symbol}\\b`, "i").test(s)
    );
    const context = mine.join(" ");

    // 2) Intent: default BUY unless sell/exit language dominates the stock's sentences.
    const action: "BUY" | "SELL" =
      /\b(sell|exit|avoid|book profit)/i.test(context) && !/\b(buy|accumulate|add)\b/i.test(context)
        ? "SELL"
        : "BUY";

    const entry =
      amountNear(context, ["buy at", "entry", "enter at", "@", "cmp", "around", "near"]) ??
      stock.lastClose;
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
    const named = mentioned.find(
      (st) =>
        s.toLowerCase().includes(st.name.toLowerCase()) ||
        new RegExp(`\\b${st.symbol}\\b`, "i").test(s)
    );
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
