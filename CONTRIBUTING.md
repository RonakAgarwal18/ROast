# Contributing to ROast

Thanks for helping keep score. Small, focused changes are easiest to land.

## Run it locally

```bash
npm install
cp .env.example .env        # DATABASE_URL="file:./dev.db"
npx prisma generate
npx prisma db push
npx prisma db seed          # the 5 Nov 2026 seed league
npm run dev                 # http://localhost:3000
```

Useful extras:

```bash
npx tsx scripts/load-stock-master.ts   # full NSE + BSE stock master
npx tsx scripts/update-prices.ts       # latest closes + snapshots
npm run build                          # production build + type check
```

## Ground rules

- **Scorekeeper, never tipster.** No feature may recommend a buy or a sell.
  ROast records claims other people made and judges them — keep that line.
- **Records are append-only.** Confirmed pastes and claims are receipts;
  never add an edit path for them. Verdicts can change, history can't.
- **No fake functionality.** If something is a stub, label it as a stub in
  the UI and the README. Label roadmap items as roadmap.
- **House style:** dark theme, Groww green `#00D09C`, amber accent, no
  blue. Money is ₹ with Indian digit grouping (`src/lib/format.ts`).
  Kitchen vocabulary for verdicts lives in `src/lib/verdicts.ts` — reuse
  it instead of inventing new labels.
- Prices settle on daily closes only. Don't wire in live price feeds.

## Pull requests

1. Branch off `main` with a short descriptive name.
2. Keep the change to one topic; say what it does and how you verified it
   (build output, routes checked, a before/after where it matters).
3. `npm run build` must pass. If you touched the schema, say what
   `prisma db push` changes and whether the seed still runs clean.
4. If you changed user-facing behaviour, update the README's feature list
   in the same PR — the README only claims what actually works.
