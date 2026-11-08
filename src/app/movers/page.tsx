import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOwnerSession } from "@/lib/auth";
import { price, pct, fmtDate, fmtDayShort } from "@/lib/format";
import { PageTitle } from "@/components/ui";
import { setMoverNote, deleteMoverNote } from "@/lib/actions";
import { computeMovers, MOVER_MIN_PRICE, type MoverRow } from "@/lib/movers";

export const dynamic = "force-dynamic";

const MIN_PRICE = 5; // skip penny noise
const TOP_N = 15;

const inputCls =
  "rounded-lg border border-edge bg-base px-3 py-2 text-sm text-cream placeholder:text-muted/60 w-full";

type Mover = MoverRow;

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const owner = await getOwnerSession();

  const dayRows = await prisma.stockClose.findMany({
    where: { stock: { exchange: { in: ["NSE", "BSE"] } } },
    distinct: ["date"],
    orderBy: { date: "desc" },
    take: 60,
    select: { date: true },
  });
  const days = dayRows.map((r) => r.date);
  const latest = days[0];
  if (!latest) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageTitle title="Daily" accent="movers" sub="No price history yet — movers appear once closes are recorded." />
      </div>
    );
  }
  let chosen = latest;
  if (sp.date) {
    const want = new Date(`${sp.date}T00:00:00.000Z`).getTime();
    const match = days.find((d) => d.getTime() === want);
    if (match) chosen = match;
  }
  const idx = days.findIndex((d) => d.getTime() === chosen.getTime());
  const prevDay = days[idx + 1];
  const nextDay = idx > 0 ? days[idx - 1] : undefined;
  const chosenIso = chosen.toISOString().slice(0, 10);

  const chosenIsoStr = chosen.toISOString().slice(0, 10);
  const computed = prevDay
    ? await computeMovers(chosenIsoStr, TOP_N)
    : { gainers: [] as Mover[], losers: [] as Mover[], prevIso: null };
  const gainers = computed.gainers;
  const losers = computed.losers;

  const headlines = await prisma.moverHeadline.findMany({
    where: { date: chosen },
    orderBy: { publishedAt: "asc" },
  });
  const headlinesBySymbol = new Map<string, typeof headlines>();
  for (const h of headlines) {
    const arr = headlinesBySymbol.get(h.symbol) ?? [];
    arr.push(h);
    headlinesBySymbol.set(h.symbol, arr);
  }

  const notes = await prisma.moverNote.findMany({ where: { date: chosen } });
  const noteBySymbol = new Map(notes.map((n) => [n.symbol, n]));

  const renderRow = (m: Mover) => {
    const note = noteBySymbol.get(m.symbol);
    return (
      <div key={m.symbol} className="px-4 py-3 border-b border-edge/60 last:border-0">
        <div className="flex items-center gap-3 text-sm">
          <div className="min-w-0">
            <Link href={`/stocks/${encodeURIComponent(m.symbol)}`} className="font-semibold hover:text-groww">
              {m.name}
            </Link>
            <div className="text-muted text-xs">
              #{m.symbol} · {price(m.prev)} → {price(m.close)}
            </div>
          </div>
          <span className={`ml-auto font-display font-bold ${m.change >= 0 ? "text-groww" : "text-loss"}`}>
            {pct(m.change)}
          </span>
        </div>
        {note ? (
          <div className="mt-2 text-sm">
            <span className="text-ambery font-semibold">Why: </span>
            {note.cause}
            {note.sourceUrl && (
              <>
                {" "}
                <a
                  href={note.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-groww underline underline-offset-2"
                >
                  source
                </a>
              </>
            )}
            {owner && (
              <form action={deleteMoverNote} className="inline ml-3">
                <input type="hidden" name="date" value={chosenIso} />
                <input type="hidden" name="symbol" value={m.symbol} />
                <button className="text-xs text-muted hover:text-loss">remove</button>
              </form>
            )}
          </div>
        ) : (
          <>
            <div className="mt-1 text-xs text-muted italic">no verified cause found</div>
            {(headlinesBySymbol.get(m.symbol) ?? []).length > 0 && (
              <div className="mt-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted mb-1">
                  In the news around then — possible context, not a verified cause
                </div>
                <ul className="space-y-1">
                  {(headlinesBySymbol.get(m.symbol) ?? []).map((h) => (
                    <li key={h.id}>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-groww underline-offset-2 hover:underline"
                      >
                        {h.title}
                      </a>
                      {h.source && <span className="text-muted text-xs"> — {h.source}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {owner && !note && (
          <form action={setMoverNote} className="mt-2 flex flex-col sm:flex-row gap-2">
            <input type="hidden" name="date" value={chosenIso} />
            <input type="hidden" name="symbol" value={m.symbol} />
            <input name="cause" required placeholder={`Why did ${m.symbol} move?`} className={inputCls} />
            <input name="sourceUrl" placeholder="Source URL" className={inputCls} />
            <button className="rounded-lg bg-groww text-black font-semibold px-4 py-2 text-sm shrink-0">
              Add cause
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Daily"
        accent="movers"
        sub="The day's biggest moves, computed from the exchange closes. A cause is only shown with a source — otherwise it honestly says no verified cause found."
      />

      <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
        {prevDay && (
          <Link
            href={`/movers?date=${prevDay.toISOString().slice(0, 10)}`}
            className="rounded-full border border-edge px-3 py-1 hover:text-groww"
          >
            ← {fmtDayShort(prevDay)}
          </Link>
        )}
        <span className="font-display font-bold text-lg">{fmtDate(chosen)}</span>
        {nextDay && (
          <Link
            href={`/movers?date=${nextDay.toISOString().slice(0, 10)}`}
            className="rounded-full border border-edge px-3 py-1 hover:text-groww"
          >
            {fmtDayShort(nextDay)} →
          </Link>
        )}
        <span className="text-muted ml-auto">
          vs {prevDay ? fmtDate(prevDay) : "—"} · stocks above {price(MIN_PRICE)} only
        </span>
      </div>

      {!prevDay && (
        <p className="text-muted">This is the first day of recorded history — no previous close to compare against.</p>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h2 className="font-display font-bold text-xl mb-3 text-groww">Top gainers</h2>
          <div className="rounded-2xl border border-edge bg-panel">{gainers.map(renderRow)}</div>
        </section>
        <section>
          <h2 className="font-display font-bold text-xl mb-3 text-loss">Top losers</h2>
          <div className="rounded-2xl border border-edge bg-panel">{losers.map(renderRow)}</div>
        </section>
      </div>
    </div>
  );
}
