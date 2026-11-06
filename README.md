# ROast

**We ROast the tip, before it burns your money.**

ROast is a stock-tip accountability league for the Indian market. Every day,
AI chatbots, analysts and finfluencers serve stock picks with total
confidence — and nobody keeps score. A tip that fails is quietly forgotten;
a tip that works is screenshotted forever.

ROast writes the tip down instead. Each pick goes into a paper portfolio at
a stated price, every checkable claim is recorded with its date and the
source's exact words, and when the date arrives the claim gets a verdict.
Sources build a permanent, public record: how often they were right, by how
much, and how badly they were wrong.

ROast is a **scorekeeper, never a tipster**. It makes no buy or sell
recommendations of its own — it only records what public sources already
claimed, with the source and the date, and publishes what happened.

## How it works

1. **Paste** — drop any AI's stock analysis into the app (or use the
   built-in Prompt Kit to make the AI answer in a structured format first).
2. **Parse** — a rule-based parser pulls out the stocks, the paper orders
   (entry, target, exit) and every dated claim. You preview and edit the
   parse before anything is saved; the original text is stored verbatim,
   append-only, as the receipt.
3. **Proof** — prices settle on daily exchange closing prices. When a
   claim's date lands, its checklist is judged on the kitchen scale:

| Verdict | Meaning |
|---|---|
| ON THE STOVE | Date hasn't arrived yet |
| WELL-DONE | Claim fully true |
| HALF-COOKED | Half true — right direction, wrong size or late |
| ROASTED | Claim false |
| BURNT | Disastrously wrong — went the other way |
| NO RECIPE | Too vague to judge (no number, no date) |
| NO RECEIPT | A checklist item with no proof behind it |

League #1 wears the **HEAD CHEF** crown. League last place is **BURNT**.
BURNT claims are framed permanently in the Burnt Bin on the Records page.

## Features

- **League table** — every portfolio ranked by return, with a per-portfolio
  equity sparkline and well-done claim counts.
- **Portfolios** — unlimited nameable paper portfolios; starting cash is
  user-chosen (₹1,00,000 is just the pre-fill). Entry prices are
  user-editable: the last close is only a default, and the price you enter
  is the price the portfolio is scored on. Closing a position at your sell
  price moves it to Records and returns the cash.
- **Add Analysis** — paste → parse → preview (editable, untickable) →
  confirm. Detects stocks from the full exchange master, buy/sell intent,
  entry/target/exit amounts, and claim dates. Ships with a three-prompt
  Prompt Kit (Standard, Quick Take, Deep Dive).
- **Compare** — any 2–3 portfolios side by side: value, cash, return,
  return vs NIFTY over the snapshot window, best/worst pick, claims
  accuracy, and overlaid equity curves.
- **Checklists** — every claim as a checklist card grouped by due date
  (overdue / today / this week / later), tick-boxes with states, and a
  verdict stamp.
- **Calendar** — catalyst events and claim verdict days with date blocks.
- **My Desk** — the owner's real holdings mirrored into the league,
  pending orders, house rules, and a day journal.
- **Records** — closed trades, judged claims, per-source stats (claims,
  well-done %, pick count, small-sample flag), and the Burnt Bin.
- **Price pipeline** — nightly closes from the official exchange bhavcopy
  files, with daily per-portfolio snapshots. See below.
- **Landing page** — live league snapshot, the Receipt Wall (latest judged
  claims), and ROast of the Day.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4, with a custom dark theme (Groww green `#00D09C`, amber
  accent, no blue)
- Prisma ORM — SQLite for local development, PostgreSQL at deploy time
  (the schema is provider-agnostic; see *Database* below)
- Fonts: Space Grotesk (display), Inter (UI), Instrument Serif italic
  (accent words)

## Quick start

```bash
npm install
cp .env.example .env        # DATABASE_URL="file:./dev.db"
npx prisma generate
npx prisma db push
npx prisma db seed          # seed league: the real 5 Nov 2026 evening
npm run dev                 # http://localhost:3000
```

Optional, once the app runs:

```bash
npx tsx scripts/load-stock-master.ts   # full NSE + BSE stock master
npx tsx scripts/update-prices.ts       # latest closes + daily snapshots
```

The seed data is a real evening (5 Nov 2026): Gemini's 7 picks as a ₹1L
paper portfolio at ₹10,000 per pick, Hanu's Nykaa call, the owner's real
holdings (Groww, Ather, Premier Energies, Stallion), a pending Nykaa limit
order, 5 dated claims, the catalyst calendar, and a baseline portfolio
snapshot for that day.

## Project structure

```
src/
  app/            pages: landing, league, portfolios (+ [id], compare),
                  add, checklists, calendar, my-desk, records, admin
  components/     shared UI (verdict stamps, date blocks, SVG equity curves)
  lib/
    actions.ts    all mutations (Server Actions)
    parser.ts     the rule-based paste parser
    prices.ts     the price pipeline (bhavcopy parsing + apply + snapshots)
    stats.ts      portfolio maths + snapshot readers
    verdicts.ts   the kitchen scale vocabulary
    format.ts     ₹ / % / date formatting (Indian digit grouping)
prisma/
  schema.prisma   data model
  seed.ts         the 5 Nov 2026 seed league
scripts/
  update-prices.ts      nightly bhavcopy download + apply
  load-stock-master.ts  official NSE/BSE company lists -> Stock table
  prices.README.md      pipeline design notes
```

## How the price pipeline works

Everything settles on **daily closing prices** — deliberately no live
prices. Brokers pay for licensed exchange feeds; a scorekeeper only ever
needs closes, and regulators discourage live prices in virtual products.

One pipeline in `src/lib/prices.ts`, three doors:

1. **Nightly script** — `scripts/update-prices.ts` downloads the official
   files for the latest trading day (walking back over weekends/holidays):
   NSE equity bhavcopy (`sec_bhavdata_full_<DDMMYYYY>.csv`), the NSE index
   close file (feeds the NIFTY row), and the BSE bhavcopy. It parses,
   updates `Stock.lastClose` / `prevClose` / `closeDate`, and writes the
   day's `PortfolioSnapshot` rows.
2. **Admin upload** — `/admin` (linked in the footer) accepts the same
   files via upload and runs the identical code, reporting how many
   stocks were updated. Works even where a network blocks the exchange
   hosts.
3. **By hand** — single closes can be corrected from My Desk, and `/admin`
   can freeze a snapshot at current closes.

The **stock master** (`scripts/load-stock-master.ts`) loads the official
listed-company lists — NSE's `EQUITY_L.csv` first, then BSE-only symbols
from the latest BSE bhavcopy. Existing rows are never overwritten, so
seeded names and recorded closes survive a refresh. New stocks start
unpriced and display "—" until the pipeline prices them.

## Scoring rules

- A portfolio's return is computed from its positions' entry prices
  against the last recorded close (plus remaining cash for paper
  portfolios; the real desk is scored on invested cost).
- **Return vs NIFTY** compares the portfolio's move with NIFTY's move
  over the same snapshot window — beating a rising market by standing
  still doesn't count.
- A source's record is its claims: total served, % judged WELL-DONE, and
  pick count. Sources with fewer than 5 claims are flagged as a small
  sample — tasty, not proven.
- Records are append-only. A confirmed paste is stored verbatim forever;
  a claim can receive a verdict, never a rewrite.

## Roadmap

Honest list of what is **not** built yet:

- Owner login / auth (the app is currently single-user; editing is
  owner-side by design)
- Deployment wiring (Neon Postgres + Vercel) — the schema and env switch
  are ready, the accounts and deploy are not done
- Fully automatic scheduling of the nightly job (the script runs today;
  cron/systemd wiring is deployment work)
- Seasons (monthly board resets) and a public submission queue for tips
- Per-claim price charts (AnaChart-style target-vs-price dots)

## Disclaimer

ROast records and judges third-party claims; it does not recommend buying
or selling anything. Paper portfolios use virtual money. **We don't
recommend anything. We only keep score.** Nothing here is investment
advice.

## License

MIT — see [LICENSE](LICENSE).
