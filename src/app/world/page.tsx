import Link from "next/link";
import { prisma } from "@/lib/db";
import { pct, fmtDayShort } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { fetchRss, googleNewsSearchUrl, type Headline } from "@/lib/headlines";
import { WORLD_DEFS, INDIA_INDEX_DEFS } from "@/lib/world";

export const dynamic = "force-dynamic";

const ET_MARKETS_RSS = "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms";

function num(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function BoardCard({ symbol, name, unit }: { symbol: string; name: string; unit?: string }) {
  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (!stock || stock.lastClose == null) return null;
  const closes = await prisma.stockClose.findMany({
    where: { stockId: stock.id },
    orderBy: { date: "desc" },
    take: 30,
  });
  const points = closes.reverse().map((c) => ({ date: c.date, value: c.close }));
  const change =
    stock.prevClose != null && stock.prevClose > 0
      ? ((stock.lastClose - stock.prevClose) / stock.prevClose) * 100
      : null;
  const up = (change ?? 0) >= 0;
  return (
    <Link
      href={`/stocks/${encodeURIComponent(symbol)}`}
      className="rounded-2xl border border-edge bg-panel p-4 hover:border-groww/60 transition-colors block"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold leading-tight">{name}</div>
        <Sparkline points={points} width={84} height={26} stroke={up ? "#00D09C" : "#FF6B5E"} />
      </div>
      <div className="font-display font-bold text-2xl mt-2">
        {num(stock.lastClose)}
        {unit && <span className="text-xs text-muted font-normal ml-1">{unit}</span>}
      </div>
      <div className={`text-sm font-semibold ${change === null ? "text-muted" : up ? "text-groww" : "text-loss"}`}>
        {change === null ? "—" : `${up ? "▲" : "▼"} ${pct(change)}`}
        <span className="text-muted font-normal text-xs">
          {" "}· {stock.closeDate ? fmtDayShort(stock.closeDate) : ""}
        </span>
      </div>
    </Link>
  );
}

async function getNews(): Promise<Headline[]> {
  const [et, india, global] = await Promise.all([
    fetchRss(ET_MARKETS_RSS),
    fetchRss(googleNewsSearchUrl("Indian stock market Sensex Nifty today")),
    fetchRss(googleNewsSearchUrl("global markets stocks Fed gold oil")),
  ]);
  const seen = new Set<string>();
  const all: Headline[] = [];
  for (const h of [...et, ...india, ...global]) {
    const key = h.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(h);
  }
  all.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return all.slice(0, 15);
}

export default async function WorldPage() {
  const news = await getNews();
  const globalDefs = WORLD_DEFS.filter((d) => d.group === "GLOBAL");
  const metalsDefs = WORLD_DEFS.filter((d) => d.group === "METALS");
  const fxDefs = WORLD_DEFS.filter((d) => d.group === "ENERGY_FX");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="World"
        accent="board"
        sub="The markets around the league — India first, then the world, refreshed by the same nightly run that prices the portfolios. Click any card for its full chart."
      />

      <h2 className="font-display font-bold text-xl mb-3">India</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {INDIA_INDEX_DEFS.map((d) => (
          <BoardCard key={d.symbol} symbol={d.symbol} name={d.name} />
        ))}
      </div>

      <h2 className="font-display font-bold text-xl mb-3">Global indices</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {globalDefs.map((d) => (
          <BoardCard key={d.symbol} symbol={d.symbol} name={d.name} unit={d.unit || undefined} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <section>
          <h2 className="font-display font-bold text-xl mb-3">Metals</h2>
          <div className="grid grid-cols-2 gap-3">
            {metalsDefs.map((d) => (
              <BoardCard key={d.symbol} symbol={d.symbol} name={d.name} unit={d.unit || undefined} />
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-display font-bold text-xl mb-3">Energy · FX · Crypto</h2>
          <div className="grid grid-cols-2 gap-3">
            {fxDefs.map((d) => (
              <BoardCard key={d.symbol} symbol={d.symbol} name={d.name} unit={d.unit || undefined} />
            ))}
          </div>
        </section>
      </div>

      <h2 className="font-display font-bold text-xl mb-3">Market headlines</h2>
      <div className="rounded-2xl border border-edge bg-panel">
        {news.length === 0 && (
          <p className="px-4 py-6 text-muted text-sm">Headlines unavailable right now — the feeds did not answer.</p>
        )}
        {news.map((h, i) => (
          <div key={i} className="px-4 py-3 border-b border-edge/60 last:border-0">
            <a href={h.url} target="_blank" rel="noreferrer" className="font-medium hover:text-groww">
              {h.title}
            </a>
            <div className="text-muted text-xs mt-0.5">
              {h.source ?? "News"}
              {h.publishedAt
                ? ` · ${fmtDayShort(h.publishedAt)}, ${h.publishedAt.toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}`
                : ""}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-3">
        Headlines link out to their publishers (Economic Times + Google News wires) — ROast keeps score, it
        doesn't republish the news.
      </p>
    </div>
  );
}
