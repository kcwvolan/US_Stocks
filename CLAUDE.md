# US Stocks Analysis Toolkit

JavaScript toolkit for fetching, analyzing, and reporting on US equities using the Yahoo Finance API.

## Commands

```bash
node scripts/stock-eval.js AAPL MSFT [--deep]   # fundamentals + technicals; --deep adds valuation scenarios, income history, signal block
node scripts/stock-screen.js [TICK ...]         # screen a watchlist (defaults to top 10 large-caps)
node scripts/technical-analysis.js AAPL        # detailed technical analysis
node scripts/options-analysis.js AAPL [--earnings]  # options chain analysis

npm test          # run tests
npm run verify    # verify API connectivity
npm run lint:json # check plugin metadata version sync
npm run pre-release  # test + verify + lint:json
```

Multi-symbol support: `stock-eval` and `stock-screen` accept multiple tickers; all others accept one.

## Architecture

- `src/fetch.js` — Yahoo Finance API calls (quote, summary, history, options, calendar); session/crumb auth handled internally
- `src/analyze.js` — pure analysis functions: `fundamentals`, `technicals`, `valuationAnalysis`, `signalBlock`, `incomeHistory`, `convictionParts`
- `src/ratinglog.js` — daily rating log (`data/rating-log.jsonl`, git-ignored) written by the watchlist push; `node scripts/rating-tracker.js` reports 1/5/20-day forward returns per rating
- `riskVeto` in `src/analyze.js` — buy-level ratings (score ≥3) are shown as 持有 when price < SMA200, earnings ≤7 days, or RSI ≥70 (conventional thresholds, constants in `RISK`); the numeric score is unchanged. News headlines (`getNews`) are display-only, not scored
- `src/technicals.js`, `src/options.js` — technical indicators (single shared implementation; RSI uses Wilder smoothing, flat series = 50) / options metrics (IV below 1% treated as missing) used by the Discord pushes and CLI scripts
- `src/report.js` — CLI rendering via chalk + cli-table3: `printReport`, `printDeep`
- `src/card.js` — Discord stock card: HTML → PNG via puppeteer-core + local Chrome (see Discord Pushes)
- `src/chart.js` — QuickChart change-% bar chart for the radar embed
- `src/webhook.js` — reads `DISCORD_WEBHOOK_URL` from env or `.env`
- `scripts/` — entry-point scripts wiring fetch → analyze → report

## Stock Analysis Workflow

- When /analyze is invoked, ALWAYS regenerate the report with fresh data unless the user explicitly asks to reuse an existing one.
- If a report file for today's date already exists, overwrite it with the new synthesis rather than just summarizing the existing file.
- Always run the three data pull scripts in parallel for speed.

## Options Data Quality Rules

The options pipeline has known data quality pitfalls. Always apply these:

1. **Bid fallback chain**: when `bid === 0` or `bid == null`, use `lastPrice`; when both are zero, use `(bid + ask) / 2` (mid). Never display $0 as a valid premium.
2. **DTE floor**: filter out contracts with DTE < 7 (stale/illiquid). Default floor is 7 days; expose as a parameter when writing new scripts.
3. **IV validation**: if `impliedVolatility` is missing or 0 on a contract that should have it, skip or flag the row — don't silently show 0%.
4. **Sanity check**: after any options script change, run a quick test against a known illiquid ticker (e.g., `node scripts/options-analysis.js ATKR`) and confirm fallbacks fire correctly before calling it done.

## Discord Pushes

Two scheduled jobs push to one Discord webhook (Taiwan time, daily):

| Time | Script | What it sends |
|---|---|---|
| 17:30 | `scripts/discord-tw-chips-push.js` | Taiwan: TWSE institutional net buy/sell (T86, BFI82U) — foreign / trust / dealer totals plus top-10 buy and sell lists (ETFs excluded); skips weekends, retries 3× if TWSE hasn't published yet, silent on holidays; also lists per-stock figures for `tw-watchlist.json` (local, git-ignored; includes listed + OTC via TPEx). Logic in `src/twchips.js` |
| 18:00 | `scripts/discord-push.js` | Market radar: Yahoo screeners (gainers / losers / most actives), top `DEEP_N` (5) scored names get a deep-analysis card; afterwards logs the top 25 of each list with sector to `data/mover-log.jsonl` (git-ignored; sectors cached in `data/sector-cache.json`) and posts a sector-trend embed (focus sectors 科技／能源, `FOCUS_SECTORS`) for the last 10/30/60/120 trading days (`src/sectors.js`; CLI: `node scripts/sector-trend.js`). Lists can't be back-filled, so long windows fill up over time |
| 18:10 | `scripts/discord-watchlist-push.js` | Every ticker in `watchlist.json` (batched), one card each; optional `cardTickers` array limits which get image cards |

- Running either script by hand **really posts to Discord**. To test a card without posting, call `renderStockCard()` from `src/card.js` and write the PNG to disk.
- Webhook lives only in `.env` (`DISCORD_WEBHOOK_URL=...`, gitignored) or the environment. Never hardcode it or print it in logs.
- Cards are images; any render/upload failure falls back to the text embed. Every card must keep: data time in Taiwan **and** US Eastern, the data-source line, the 120-day price + volume chart, the Conviction breakdown, and the rating-threshold footnote.
- Rating (強力買入 / 買入 / 持有 / 賣出 / 強力賣出) is rule-based, not a human or LLM judgement. `convictionParts()` in `src/analyze.js` is the single source of the score; both push scripts call it, and the thresholds live in `rating()` in `src/card.js`. Change the formula in one place only.
- Chrome is found via `CHROME_PATH` or the standard macOS app paths.

### Scheduling (launchd, not cron)

- `setup-launchd.sh` copies `com.kcw.discord-market-push.plist` and `com.kcw.discord-watchlist-push.plist` / `com.kcw.discord-tw-chips-push.plist` to `~/Library/LaunchAgents/`, loads them, and removes any old cron entries. The plists have no weekday filter, so they run every day. The wrappers `run-market-push.sh` / `run-watchlist-push.sh` / `run-tw-chips-push.sh` set PATH and append to `discord-push.log` / `discord-watchlist-push.log` / `discord-tw-chips-push.log`.
- `setup-cron.sh` is the superseded cron approach; do not install it alongside launchd or each job pushes twice.
- Check status: `launchctl list | grep discord` (second column is the last exit code). Re-run now: `launchctl kickstart -k gui/$(id -u)/com.kcw.discord-watchlist-push`.
- Known pitfall: the project sits in `~/Documents`, which macOS protects. Under launchd, `/bin/bash` needs **Full Disk Access** (System Settings → Privacy & Security → Full Disk Access → add `/bin/bash`). Without it the job exits 126 before the script starts and nothing is written to the log, so the push silently never happens.

## Report Generation Conventions

- **Incremental saves for batch runs**: when processing multiple tickers, write each report to `reports/<TICKER>_<DATE>.md` immediately after generating it — before moving to the next ticker. This way a session interruption only loses the current ticker, not the whole batch.
- **Required sections in institutional reports**: Thesis, Technicals, Options Flow, Risks, Price Targets. A report missing any of these sections is incomplete.
- **Date format in filenames**: `YYYYMMDD` (e.g., `reports/AAPL_20260508.md`).

## Coding Conventions

- ES modules (`import`/`export`), no CommonJS.
- Raw Yahoo Finance values may arrive as `{ raw, fmt }` objects — always unwrap with `val?.raw ?? val` before arithmetic.
- `formatLarge` / `fmtN` handles T/B/M/K formatting; use it rather than inline number formatting.
- No comments unless the WHY is non-obvious. No docstrings.
- Keep analysis logic in `src/analyze.js` (pure functions) and rendering in `src/report.js` — scripts in `scripts/` are thin wiring only.
