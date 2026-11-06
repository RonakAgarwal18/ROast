// The kitchen scale — one vocabulary across claims, cards and stamps.

export const VERDICTS = [
  "ON_THE_STOVE",
  "WELL_DONE",
  "HALF_COOKED",
  "ROASTED",
  "BURNT",
  "NO_RECIPE",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_META: Record<Verdict, { label: string; className: string }> = {
  ON_THE_STOVE: { label: "On the stove", className: "text-muted" },
  WELL_DONE: { label: "Well-done", className: "text-groww" },
  HALF_COOKED: { label: "Half-cooked", className: "text-ambery" },
  ROASTED: { label: "Roasted", className: "text-loss" },
  BURNT: { label: "Burnt", className: "text-loss" },
  NO_RECIPE: { label: "No recipe", className: "text-muted" },
};

export const ITEM_STATES = ["VERIFIED", "PENDING", "NO_RECEIPT", "FAILED"] as const;

export const ITEM_META: Record<string, { icon: string; label: string; className: string }> = {
  VERIFIED: { icon: "☑", label: "Verified", className: "text-groww" },
  PENDING: { icon: "☐", label: "On the stove", className: "text-muted" },
  NO_RECEIPT: { icon: "◍", label: "No receipt", className: "text-ambery" },
  FAILED: { icon: "☒", label: "Failed", className: "text-loss" },
};
