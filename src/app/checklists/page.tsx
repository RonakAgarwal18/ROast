import { prisma } from "@/lib/db";
import { fmtDate, daysBetween } from "@/lib/format";
import { setVerdict, cycleItemState } from "@/lib/actions";
import { PageTitle, VerdictStamp, ItemState } from "@/components/ui";
import { VERDICTS } from "@/lib/verdicts";

export const dynamic = "force-dynamic";

const smallSelect =
  "rounded-md border border-edge bg-base px-2 py-1 text-xs text-cream";

function ClaimCard({ claim }: { claim: Awaited<ReturnType<typeof fetchClaims>>[number] }) {
  return (
    <div className="rounded-2xl border border-edge bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <span className="pill">#{claim.stock.symbol}</span>
          <span className="pill">{claim.source.name}</span>
          <span className="pill border-ambery/50 text-ambery">due {fmtDate(claim.dueDate)}</span>
        </div>
        <VerdictStamp verdict={claim.verdict} />
      </div>

      <p className="mt-3 font-medium leading-relaxed">{claim.claimText}</p>
      <p className="mt-1 text-xs text-muted italic">Receipt: “{claim.quoteSentence}”</p>

      <ul className="mt-4 space-y-2">
        {claim.items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            <form action={cycleItemState}>
              <input type="hidden" name="itemId" value={it.id} />
              <button className="cursor-pointer hover:scale-110 transition-transform" title="Click to change state">
                <ItemState state={it.state} />
              </button>
            </form>
            <span className={it.state === "VERIFIED" ? "text-cream" : "text-muted"}>{it.label}</span>
          </li>
        ))}
      </ul>

      <form action={setVerdict} className="mt-4 flex items-center gap-2">
        <input type="hidden" name="claimId" value={claim.id} />
        <select name="verdict" defaultValue={claim.verdict} className={smallSelect}>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {v.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button className="pill border-groww/60 text-groww hover:bg-groww-dim cursor-pointer">
          Stamp verdict
        </button>
      </form>
    </div>
  );
}

async function fetchClaims() {
  return prisma.claim.findMany({
    include: { stock: true, source: true, items: true },
    orderBy: { dueDate: "asc" },
  });
}

export default async function ChecklistsPage() {
  const claims = await fetchClaims();
  const now = new Date();
  const open = claims.filter((c) => c.verdict === "ON_THE_STOVE");
  const judged = claims.filter((c) => c.verdict !== "ON_THE_STOVE");

  const groups: Array<{ title: string; items: typeof open }> = [
    { title: "Overdue — the stove is smoking", items: open.filter((c) => daysBetween(now, c.dueDate) < 0) },
    { title: "Due today", items: open.filter((c) => daysBetween(now, c.dueDate) === 0) },
    { title: "This week", items: open.filter((c) => { const n = daysBetween(now, c.dueDate); return n > 0 && n <= 7; }) },
    { title: "Later", items: open.filter((c) => daysBetween(now, c.dueDate) > 7) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Checklists"
        accent="every claim, judged"
        sub="Each claim is a checklist with a due date. Tick the boxes as reality reports in; stamp the verdict when the date lands."
      />

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="mb-10">
              <h2 className="font-display text-2xl font-bold mb-4">{g.title}</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {g.items.map((c) => (
                  <ClaimCard key={c.id} claim={c} />
                ))}
              </div>
            </section>
          )
      )}

      {open.length === 0 && (
        <p className="text-muted mb-10">Nothing on the stove. Paste an analysis to serve new claims.</p>
      )}

      {judged.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold mb-4">Already judged</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {judged.map((c) => (
              <ClaimCard key={c.id} claim={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
