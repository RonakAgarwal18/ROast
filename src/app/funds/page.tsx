import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOwnerSession } from "@/lib/auth";
import { price, fmtDate } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { fundDisplayName, fundSymbol } from "@/lib/funds";
import { addFundBenchmark } from "@/lib/actions";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60";

function shortCategory(cat: string): string {
  const m = cat.match(/\((.*)\)/);
  return m ? m[1] : cat;
}

type SchemeLite = {
  schemeCode: string;
  name: string;
  plan: string;
  option: string;
  amc: string;
  category: string;
  nav: number | null;
  navDate: Date | null;
};

function AddForm({ schemeCode }: { schemeCode: string }) {
  return (
    <form action={addFundBenchmark} className="flex items-center gap-2 shrink-0">
      <input type="hidden" name="schemeCode" value={schemeCode} />
      <input
        name="cash"
        type="number"
        min={1000}
        step={1000}
        defaultValue={100000}
        className={`${inputCls} w-28`}
        aria-label="Starting cash"
      />
      <button className="rounded-lg bg-groww text-black font-semibold px-3 py-2 text-sm whitespace-nowrap">
        Add to league
      </button>
    </form>
  );
}

function SchemeRow({
  scheme,
  owner,
  inLeague,
}: {
  scheme: SchemeLite;
  owner: boolean;
  inLeague: boolean;
}) {
  return (
    <div className="px-4 py-3 border-b border-edge/60 last:border-0 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{fundDisplayName(scheme)}</div>
        <div className="text-muted text-xs mt-0.5">
          {scheme.amc} · {shortCategory(scheme.category)} · NAV{" "}
          {scheme.nav != null ? price(scheme.nav) : "—"}
          {scheme.navDate ? ` @ ${fmtDate(scheme.navDate)}` : ""}
        </div>
      </div>
      {inLeague ? (
        <Link
          href={`/stocks/${fundSymbol(scheme.schemeCode)}`}
          className="text-groww text-sm font-semibold shrink-0"
        >
          In the league →
        </Link>
      ) : owner ? (
        <AddForm schemeCode={scheme.schemeCode} />
      ) : null}
    </div>
  );
}

const SUGGESTIONS: Array<{
  label: string;
  blurb: string;
  patterns: string[];
}> = [
  {
    label: "Nifty 50 Index",
    blurb: "The market itself — the yardstick every portfolio here is secretly racing.",
    patterns: ["UTI Nifty 50 Index Fund", "Nifty 50 Index Fund"],
  },
  {
    label: "Flexi Cap",
    blurb: "Go-anywhere equity from India's most-watched fund house.",
    patterns: ["Parag Parikh Flexi Cap"],
  },
  {
    label: "Midcap",
    blurb: "The midcap horse — higher octane than the index.",
    patterns: ["Motilal Oswal Midcap"],
  },
  {
    label: "Smallcap",
    blurb: "The wild end of the market, in fund form.",
    patterns: ["Quant Small Cap", "Nippon India Small Cap"],
  },
  {
    label: "Gold",
    blurb: "The hedge — where money hides when equities misbehave.",
    patterns: ["SBI Gold Fund", "Nippon India Gold Savings", "HDFC Gold Fund"],
  },
  {
    label: "Liquid",
    blurb: "The parking lot — what idle cash earns while it waits.",
    patterns: ["Parag Parikh Liquid", "Axis Liquid"],
  },
];

async function findSuggested(patterns: string[]): Promise<SchemeLite | null> {
  for (const pattern of patterns) {
    const hit = await prisma.fundScheme.findFirst({
      where: {
        name: { contains: pattern, mode: "insensitive" },
        plan: "Direct Plan",
        option: { startsWith: "Growth" },
      },
      orderBy: { name: "asc" },
    });
    if (hit) return hit;
  }
  return null;
}

export default async function FundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const owner = (await getOwnerSession()) !== null;
  const tab = sp.tab === "all" ? "all" : "suggested";
  const q = (sp.q ?? "").trim();

  const [total, latestNav, mfStocks] = await Promise.all([
    prisma.fundScheme.count(),
    prisma.fundScheme.findFirst({
      where: { navDate: { not: null } },
      orderBy: { navDate: "desc" },
      select: { navDate: true },
    }),
    prisma.stock.findMany({
      where: { exchange: "MF" },
      select: { symbol: true },
    }),
  ]);
  const inLeague = new Set(mfStocks.map((s) => s.symbol.replace(/^MF/, "")));

  const suggested =
    tab === "suggested"
      ? (
          await Promise.all(
            SUGGESTIONS.map(async (s) => ({ ...s, scheme: await findSuggested(s.patterns) }))
          )
        ).filter((s) => s.scheme !== null)
      : [];

  const results: SchemeLite[] =
    tab === "all"
      ? await prisma.fundScheme.findMany({
          where: q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { amc: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          orderBy: { name: "asc" },
          take: 60,
        })
      : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Mutual"
        accent="funds"
        sub={`Benchmarks, not advice. Add a fund to the league with virtual cash and it races the AI portfolios on the same board — valued nightly from AMFI's official NAV file${
          latestNav?.navDate ? ` (NAVs as of ${fmtDate(latestNav.navDate)})` : ""
        }. ${total.toLocaleString("en-IN")} schemes on record.`}
      />

      {sp.error && (
        <p className="text-loss text-sm mb-4">
          That scheme could not be added — it may have no current NAV on file.
        </p>
      )}

      <div className="flex gap-2 mb-6">
        <Link
          href="/funds?tab=suggested"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${
            tab === "suggested"
              ? "border-groww text-groww bg-groww-dim"
              : "border-edge text-muted hover:text-cream"
          }`}
        >
          Suggested benchmarks
        </Link>
        <Link
          href="/funds?tab=all"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${
            tab === "all"
              ? "border-groww text-groww bg-groww-dim"
              : "border-edge text-muted hover:text-cream"
          }`}
        >
          Search all funds
        </Link>
      </div>

      {tab === "suggested" && (
        <div className="space-y-6">
          {suggested.map((s) => (
            <section key={s.label}>
              <h2 className="font-display font-bold text-lg">{s.label}</h2>
              <p className="text-muted text-sm mb-2">{s.blurb}</p>
              <div className="rounded-2xl border border-edge bg-panel">
                <SchemeRow
                  scheme={s.scheme!}
                  owner={owner}
                  inLeague={inLeague.has(s.scheme!.schemeCode)}
                />
              </div>
            </section>
          ))}
          <p className="text-xs text-muted">
            Every suggestion is a Direct Plan · Growth scheme — the cleanest yardstick version of
            its category. A benchmark is a measuring stick, not a recommendation to invest.
          </p>
        </div>
      )}

      {tab === "all" && (
        <div>
          <form method="get" className="flex gap-2 mb-4">
            <input type="hidden" name="tab" value="all" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search 14,000+ schemes — try “flexi”, “gold”, a fund house…"
              className={`${inputCls} flex-1`}
            />
            <button className="rounded-lg bg-groww text-black font-semibold px-4 py-2 text-sm">
              Search
            </button>
          </form>
          <div className="rounded-2xl border border-edge bg-panel">
            {results.length === 0 && (
              <p className="px-4 py-6 text-muted text-sm">
                {q ? "No schemes match that search." : "Type to search the full AMFI list."}
              </p>
            )}
            {results.map((r) => (
              <SchemeRow
                key={r.schemeCode}
                scheme={r}
                owner={owner}
                inLeague={inLeague.has(r.schemeCode)}
              />
            ))}
          </div>
          {results.length === 60 && (
            <p className="text-xs text-muted mt-2">Showing the first 60 matches — narrow the search to see more.</p>
          )}
        </div>
      )}
    </div>
  );
}
