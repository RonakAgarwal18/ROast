import { prisma } from "@/lib/db";
import { price } from "@/lib/format";
import { parsePaste, confirmPaste } from "@/lib/actions";
import { PageTitle } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import type { ParseResult } from "@/lib/parser";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

const PROMPT_KIT = `You are my stock analyst. Give me your picks for the Indian market (NSE/BSE) in EXACTLY this format — one block per stock, no extra commentary inside the blocks:

STOCK: <full company name> (<NSE symbol>)
ACTION: BUY or SELL
ENTRY: ₹<price you expect it to be bought at>
TARGET: ₹<target price>
EXIT: ₹<price below/above which the idea is wrong>
CATALYST: <the one event or fact driving this pick>
KEY DATE: <date the catalyst lands, e.g. 14 Nov 2026>
CLAIMS:
- <one checkable claim per line, each with a number or a date>

Rules: every claim must be falsifiable (a number, a date, or a named event). If you cannot name a catalyst and a key date, do not include the stock. End with one line: BIGGEST RISK: <what kills this set of picks>.`;

type Draft = {
  draft?: string;
  sourceName?: string;
  text?: string;
};

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<Draft>;
}) {
  const sp = await searchParams;
  const portfolios = await prisma.portfolio.findMany({ orderBy: { id: "asc" } });

  let parsed: ParseResult | null = null;
  if (sp.draft) {
    try {
      parsed = JSON.parse(Buffer.from(sp.draft, "base64url").toString("utf8"));
    } catch {
      parsed = null;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Add Analysis"
        accent="paste · parse · proof"
        sub="Paste any AI's analysis. ROast detects the stocks, drafts the paper orders and the claim checklists — you preview, fix, and confirm. Nothing is saved until you say so."
      />

      {/* ---------- Paste box ---------- */}
      <form action={parsePaste} className="rounded-2xl border border-edge bg-panel p-5 mb-6">
        <div className="flex flex-wrap gap-3 mb-3">
          <input
            name="sourceName"
            required
            defaultValue={sp.sourceName ?? ""}
            placeholder="Source name — e.g. Gemini, ChatGPT, a Telegram channel"
            className={`${inputCls} flex-1 min-w-64`}
          />
        </div>
        <textarea
          name="text"
          required
          rows={9}
          defaultValue={sp.text ?? ""}
          placeholder="Paste the analysis here… (works best with the Prompt Kit below)"
          className={`${inputCls} w-full font-mono text-[13px] leading-relaxed`}
        />
        <button className="mt-3 rounded-full bg-groww text-black font-display font-bold px-6 py-2.5 hover:brightness-110 cursor-pointer">
          Parse it →
        </button>
      </form>

      {/* ---------- Preview ---------- */}
      {parsed && (
        <form action={confirmPaste} className="rounded-2xl border-2 border-ambery/50 bg-panel p-5 mb-10">
          <h2 className="font-display text-2xl font-bold">
            Preview — <span className="font-accent italic font-normal text-ambery">check the parse</span>
          </h2>
          <p className="text-sm text-muted mt-1">
            Untick anything wrong, edit any price (the entry price is what the portfolio gets
            scored on), then confirm. The pasted text is stored verbatim as the receipt.
          </p>

          <input type="hidden" name="sourceName" value={sp.sourceName ?? ""} />
          <input type="hidden" name="text" value={sp.text ?? ""} />
          <input
            type="hidden"
            name="payload"
            value={JSON.stringify(parsed)}
            readOnly
          />

          <h3 className="font-display font-bold mt-6 mb-2">
            Detected orders ({parsed.positions.length})
          </h3>
          {parsed.positions.length === 0 && (
            <p className="text-sm text-loss">
              No known stocks detected. The parser matches companies in the stock master —
              seed more stocks, or add the position manually from the portfolio page.
            </p>
          )}
          <div className="space-y-2">
            {parsed.positions.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-base px-3 py-2 text-sm">
                <span className="pill border-groww/60 text-groww">{p.action}</span>
                <span className="font-semibold">{p.name}</span>
                <span className="pill">#{p.symbol}</span>
                <span className="text-muted">
                  entry {price(p.entryPrice)}
                  {p.targetPrice ? ` · target ${price(p.targetPrice)}` : ""}
                  {p.exitPrice ? ` · exit ${price(p.exitPrice)}` : ""}
                </span>
              </div>
            ))}
          </div>

          <h3 className="font-display font-bold mt-6 mb-2">
            Detected claims ({parsed.claims.length}) — all start ON THE STOVE
          </h3>
          <div className="space-y-2">
            {parsed.claims.map((c, i) => (
              <div key={i} className="rounded-lg border border-edge bg-base px-3 py-2 text-sm">
                <span className="pill mr-2">#{c.symbol}</span>
                <span className="pill mr-2">due {c.dueDate}</span>
                {c.claimText}
              </div>
            ))}
            {parsed.claims.length === 0 && (
              <p className="text-sm text-muted">
                No dated/numbered claims detected — if the analysis has none, that itself is a
                NO RECIPE signal.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Send orders to
              <select name="portfolioId" className={inputCls}>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              ₹ per pick (fixed sizing)
              <input name="amountPerPick" type="number" step="any" defaultValue={10000} className={inputCls} />
            </label>
          </div>
          <button className="mt-4 rounded-full bg-ambery text-black font-display font-bold px-6 py-2.5 hover:brightness-110 cursor-pointer">
            Confirm — serve it into the league
          </button>
        </form>
      )}

      {/* ---------- Prompt Kit ---------- */}
      <section className="rounded-2xl border border-edge bg-panel p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-2xl font-bold">
            The Prompt <span className="font-accent italic font-normal text-groww">Kit</span>
          </h2>
          <CopyButton text={PROMPT_KIT} />
        </div>
        <p className="text-sm text-muted mt-2 max-w-3xl">
          Optional, never compulsory: paste this into your AI <em>before</em> asking for picks.
          The AI answers in our format, and the parser above reads it almost perfectly —
          every pick arrives with an entry, a target, an exit, a catalyst and dated claims.
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-edge bg-base p-4 text-[13px] leading-relaxed text-cream/90 font-mono">
          {PROMPT_KIT}
        </pre>
        <p className="text-xs text-muted mt-3">
          Manual instead? Add positions one by one from any portfolio page — the paste box is
          the headline, not the only door.
        </p>
      </section>
    </div>
  );
}
