import { VERDICT_META, ITEM_META, type Verdict } from "@/lib/verdicts";
import { fmtDayShort } from "@/lib/format";

/** Rotated verdict stamp, e.g. WELL-DONE in green, ROASTED in red. */
export function VerdictStamp({ verdict, large = false }: { verdict: string; large?: boolean }) {
  const meta = VERDICT_META[verdict as Verdict] ?? VERDICT_META.ON_THE_STOVE;
  return (
    <span className={`stamp ${meta.className} ${large ? "text-sm px-3 py-1" : ""}`}>
      {meta.label}
    </span>
  );
}

/** One checklist tick-box line. */
export function ItemState({ state }: { state: string }) {
  const meta = ITEM_META[state] ?? ITEM_META.PENDING;
  return (
    <span className={`font-bold ${meta.className}`} title={meta.label}>
      {meta.icon}
    </span>
  );
}

/** Coloured date block (Wafa-style agenda card). */
export function DateBlock({ date, tone = "green" }: { date: Date; tone?: "green" | "amber" | "red" }) {
  const day = date.getDate();
  const mon = date.toLocaleDateString("en-IN", { month: "short" });
  const bg =
    tone === "amber" ? "bg-ambery text-black" : tone === "red" ? "bg-loss text-black" : "bg-groww text-black";
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg w-14 h-14 shrink-0 ${bg}`}>
      <span className="font-display font-bold text-xl leading-none">{day}</span>
      <span className="text-[0.65rem] font-bold uppercase tracking-widest">{mon}</span>
    </div>
  );
}

/** Section heading used across app pages. */
export function PageTitle({
  title,
  accent,
  sub,
}: {
  title: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
        {title}{" "}
        {accent && <span className="font-accent italic font-normal text-groww">{accent}</span>}
      </h1>
      {sub && <p className="text-muted mt-2 max-w-2xl">{sub}</p>}
    </div>
  );
}

export function DueLabel({ due }: { due: Date }) {
  return <span className="pill">due {fmtDayShort(due)}</span>;
}
