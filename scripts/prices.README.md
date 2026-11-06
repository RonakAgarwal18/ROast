# Price updates — how the pipeline works (implemented in Round 2)

ROast settles everything on **daily closing prices**. It deliberately does
**not** use live prices: brokers pay for licensed exchange feeds, free feeds
are unofficial, and a scorekeeper only ever needs closes.

## One pipeline, three doors

All price updates run through `src/lib/prices.ts`:

- `parseBhavcopyCsv(text)` — detects the file format from its header row
  (NSE full bhavdata, legacy NSE `cm` bhavcopy, BSE UDiFF, old BSE
  name-keyed format, or the NSE index close file) and extracts
  symbol → close / previous close, plus the trading date inside the file.
- `applyBhavcopy(parsed, date?)` — updates `Stock.lastClose` / `prevClose` /
  `closeDate` for every symbol the master knows, then writes that day's
  `PortfolioSnapshot` row for every portfolio (total value, return %,
  and the NIFTY close, so "vs NIFTY" works over any window).

Doors:

1. **Nightly script** — `npx tsx scripts/update-prices.ts` downloads the
   official files for the latest trading day (walking back over weekends
   and holidays):
   - NSE equity: `sec_bhavdata_full_<DDMMYYYY>.csv` from nsearchives.nseindia.com
   - NSE indices: `ind_close_all_<DDMMYYYY>.csv` (feeds the NIFTY row)
   - BSE equity: `BhavCopy_BSE_CM_0_0_0_<YYYYMMDD>_F_0000.csv` from bseindia.com
   `--date 2026-11-05` pins a day; `--file ./x.csv` runs a local file
   through the identical pipeline.
2. **Admin upload** — `/admin` (linked from the footer): upload any of the
   files above and the same code runs in the browser session, reporting how
   many stocks were updated. This is the guaranteed route when a network
   blocks the exchange hosts.
3. **By hand** — the My Desk "set" box still updates a single close, and
   `/admin` has a "snapshot now" button that freezes today's values without
   a price file.

## Stock master

`npx tsx scripts/load-stock-master.ts` loads the official lists into the
`Stock` table (NSE `EQUITY_L.csv` first, then BSE-only symbols from the
latest BSE bhavcopy). Existing rows are never overwritten — seeded names
and recorded closes survive. New stocks start unpriced (`lastClose = null`,
shown as "—") until the pipeline prices them.
