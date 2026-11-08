// Whole-share sizing for a ₹ allocation. Indian equities trade in
// whole shares, so an allocation rarely deploys exactly. Pure flooring
// wastes too much (₹25,000 into a ₹5,300 share deploys only ₹21,200),
// so the rule is: take the share count whose total is CLOSEST to the
// target — including one share over — but rounding up is leashed: the
// overshoot may not exceed 20% of the allocation, so a small cheque
// never balloons into an expensive share. Ties go to the floor.
export function nearestShares(amount: number, price: number): number {
  if (!amount || !price || price <= 0) return 0;
  const floorN = Math.floor(amount / price);
  if (floorN < 1) {
    return price - amount <= 0.2 * amount ? 1 : 0;
  }
  const under = amount - floorN * price;
  const over = (floorN + 1) * price - amount;
  if (over < under && over <= 0.2 * amount) return floorN + 1;
  return floorN;
}
