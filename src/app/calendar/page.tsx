import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageTitle, DateBlock } from "@/components/ui";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "green" | "amber" | "red"> = {
  RESULTS: "green",
  REGULATORY: "amber",
  DATA: "green",
  OTHER: "green",
};

export default async function CalendarPage() {
  const events = await prisma.catalystEvent.findMany({
    include: { stock: true },
    orderBy: { date: "asc" },
  });
  const claims = await prisma.claim.findMany({
    include: { stock: true, source: true },
    orderBy: { dueDate: "asc" },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle
        title="Calendar"
        accent="dates decide"
        sub="Every dated catalyst and every claim's verdict day, in one place. In this kitchen, dates are deadlines."
      />

      <h2 className="font-display text-2xl font-bold mb-4">Catalysts</h2>
      <div className="space-y-3 mb-12">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-4 rounded-2xl border border-edge bg-panel p-4">
            <DateBlock date={e.date} tone={KIND_TONE[e.kind] ?? "green"} />
            <div>
              <div className="font-semibold">{e.title}</div>
              <div className="text-xs text-muted mt-0.5">
                {fmtDate(e.date)} · {e.kind}
                {e.stock ? ` · #${e.stock.symbol}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-display text-2xl font-bold mb-4">Verdict days</h2>
      <div className="space-y-3">
        {claims.map((c) => (
          <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-edge bg-panel p-4">
            <DateBlock date={c.dueDate} tone={c.verdict === "ON_THE_STOVE" ? "amber" : "green"} />
            <div>
              <div className="font-semibold">
                {c.stock.name} — claim by {c.source.name}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {fmtDate(c.dueDate)} · verdict: {c.verdict.replaceAll("_", " ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
