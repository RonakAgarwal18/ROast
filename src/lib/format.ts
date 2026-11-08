// Small formatting helpers — everything money is INR, everything tabular.

export function inr(n: number, digits = 0): string {
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function price(n: number): string {
  return inr(n, 2);
}

/** Price that may not exist yet (master-loaded stock, never priced). */
export function priceOpt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : inr(n, 2);
}

export function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDayShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Whole days from `from` to `to` (negative = in the past). */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Indian equities trade in WHOLE shares only — fractional units are
 * real solely for mutual funds (exchange "MF"). */
export function wholeShares(exchange: string, units: number): number {
  return exchange === "MF" ? units : Math.floor(units);
}

/** Display units: whole number for equities, up to 3dp for funds,
 * exact legacy value when a historical row is fractional. */
export function unitsFmt(exchange: string, units: number): string {
  if (exchange === "MF") {
    return units.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  }
  return Number.isInteger(units)
    ? units.toLocaleString("en-IN")
    : units.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
