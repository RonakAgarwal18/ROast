# ROast

**We ROast the tip, before it burns your money.**

ROast is a stock-tip accountability league for India. AI tools and tipsters
"serve" stock picks every day — ROast puts each pick into a paper portfolio,
writes its claims down with dates and the source's exact words, and judges
what actually happened.

ROast is a **scorekeeper, never a tipster**: it makes no buy/sell
recommendations of its own. It only records what public sources already
claimed (with source + date) and publishes the outcome.

## The kitchen scale (verdicts)

| Verdict | Meaning |
|---|---|
| ON THE STOVE | Date hasn't arrived yet |
| WELL-DONE | Claim fully true (cooked right — well done!) |
| HALF-COOKED | Half true — right direction, wrong size or late |
| ROASTED | Claim false |
| BURNT | Disastrously wrong — went the other way |
| NO RECIPE | Too vague to judge (no number, no date) |
| NO RECEIPT | An item with no proof behind it |

League #1 wears the **HEAD CHEF** crown. League last place is **BURNT**.

## What's in v1 (the basics)

- **Landing** — Adspace-style hero, rotating PASTE · PARSE · PROOF · ROAST badge,
  live league snapshot, how-it-works, the scorekeeper disclaimer.
- **League** (`/league`) — all portfolios ranked by return %, giant leader number.
- **Portfolios** (`/portfolios`, `/portfolios/[id]`) — unlimited nameable paper
  portfolios; starting cash is user-chosen (default ₹1,00,000); positions with
  **user-editable entry prices** (the last close is only a pre-fill); close a
  position at your sell price and it moves to Records.
- **Add Analysis** (`/add`) — the headline feature: paste any AI's analysis →
  a rule-based parser drafts the orders + claim checklists → you preview, fix,
  confirm. The pasted text is stored **verbatim, append-only** (the receipt).
  Includes the **Prompt Kit**: a copyable prompt that makes AIs answer in a
  parse-friendly format. Manual entry stays available on every portfolio page.
- **Checklists** (`/checklists`) — every claim as a checklist card, grouped by
  due date, tick-boxes with states, verdict stamps.
- **Calendar** (`/calendar`) — catalyst events + verdict days with date blocks.
- **My Desk** (`/my-desk`) — the owner's real holdings, pending order, rules
  panel, day notes.
- **Records** (`/records`) — closed trades, judged claims, per-source stats
  (claims, WELL-DONE %, pick count, small-sample flag).

## Stack

Next.js (App Router) + React + TypeScript · Tailwind CSS v4 · Prisma ORM.

Fonts: Space Grotesk (display), Inter (UI/numbers), Instrument Serif italic
(single accent words). Palette: dark charcoal `#0B0F0C`, Groww green
`#00D09C`, amber `#FFB547`, red only for losses. **No blue, anywhere.**

## Run it

```bash
npm install
cp .env.example .env        # DATABASE_URL="file:./dev.db"
npx prisma generate
npx prisma db push
npx prisma db seed          # real seed data from 5 Nov 2026
npm run dev                 # http://localhost:3000
```

Seed data: Gemini's 7 picks as a ₹1L paper portfolio (₹10k per pick), Hanu's
Nykaa call, the owner's real holdings (Groww, Ather, Premier, Stallion), the
pending Nykaa limit order, 5 dated claims, and the catalyst calendar.

## Database — SQLite now, Postgres at deploy

v1 uses **SQLite** via Prisma (a file DB) so it runs anywhere with zero
external accounts. The models are provider-agnostic: to deploy on PostgreSQL
(Neon), change `provider` in `prisma/schema.prisma` to `"postgresql"` and
point `DATABASE_URL` at Neon. Nothing else changes.

> Restricted-network note: Prisma downloads its engine binaries on install /
> first generate. If your network blocks `binaries.prisma.sh`, place
> `libquery_engine-<platform>.so.node` and `schema-engine-<platform>` in
> `node_modules/@prisma/engines/` and `node_modules/prisma/` manually.

## Prices

Everything settles on **daily closing prices** — deliberately no live prices
(brokers pay for licensed exchange feeds; a scorekeeper needs closes, and
regulators discourage live prices in virtual products). The design: a full
NSE+BSE stock master powers search, and a nightly job ingests each exchange's
**bhavcopy** (one file per exchange with every stock's close) to update
`Stock.lastClose`. See `scripts/prices.README.md`; `scripts/update-prices.ts`
is the stub. Until it's wired, closes update by hand from My Desk.

Note on seed symbols: `STALLION` is the display symbol used for Stallion
India Fluorochemicals in the seed master; verify the exchange ticker when the
full stock master lands.

## Roadmap / TODO

- Nightly bhavcopy ingest + daily PortfolioSnapshot rows + compare charts
- TipRanks-style scoring (success rate, avg return, significance, vs NIFTY)
- Prompt Kit v2 prompts (per style: results / momentum / doubler)
- Receipt Wall (public verdict feed), Seasons, the Burnt Bin
- Owner login (v1 is single-user, no auth)
- Deploy: Neon Postgres + Vercel

## Disclaimer

Paper portfolios use virtual money. ROast records and judges third-party
claims; it does not recommend buying or selling anything. Not investment advice.
