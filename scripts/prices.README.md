# Nightly price updates — design (v1 ships the stub, not the job)

ROast settles everything on **daily closing prices**. It deliberately does
**not** use live prices: brokers pay for licensed exchange feeds, free feeds
are unofficial, and a scorekeeper only ever needs closes.

## The pipeline (one run per evening, after market close)

1. **Stock master** — the full NSE + BSE listed-company lists are published by
   the exchanges as free CSVs. Load them into the `Stock` table
   (symbol, name, exchange). Refresh weekly; listings change slowly.

2. **Bhavcopy** — each exchange publishes ONE daily file (the *bhavcopy*)
   carrying that day's OHLC for **every listed stock**:
   - NSE: `cm<DDMMMYYYY>bhav.csv.zip` from the NSE archives
   - BSE: daily equity bhavcopy CSV from bseindia.com
   Download both, unzip, parse.

3. **Update closes** — for each row, set `Stock.lastClose` + `Stock.closeDate`.
   Any stock in the master becomes addable at its true last close; portfolio
   values, league returns, snapshots and claim price-checks all read from
   these two columns.

4. **Snapshots & scoring (next step)** — after the closes land, write a daily
   value snapshot per portfolio (powers compare charts) and recompute
   per-source scores: success rate, average return, small-sample flag,
   benchmark-relative return vs the NIFTY close stored the same way.

## Running the stub

`scripts/update-prices.ts` contains the step-by-step skeleton with the file
formats noted. It prints what it *would* do; wiring the actual downloads is a
v1.1 task. Until then, closes can be updated by hand from My Desk
(the "set" box next to each holding) — v1 seeds carry the 5 Nov 2026 closes.
