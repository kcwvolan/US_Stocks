---
name: stock-eval
description: Institutional-grade US stock analysis — fundamentals, technicals, valuation (DCF/comps/ROIC), Piotroski F-Score, competitor moat analysis, and risk matrix. Equivalent to a 30–50 page sell-side research report.
triggers:
  - /stock-eval
  - /us-stock-analysis:stock-eval
args:
  - name: symbol
    description: US stock ticker symbol (e.g. AAPL, NVDA, NFLX)
    required: true
  - name: --deep
    description: Include 10-K narrative analysis and full DCF sensitivity table
    required: false
---

# stock-eval skill

## What this skill does

Given a US stock ticker, produce a complete institutional analysis covering:

1. **Live Data Fetch** — Pull real-time price, fundamentals, and 1-year price history from Yahoo Finance
2. **Piotroski F-Score** — Score all 9 criteria across profitability, leverage, and efficiency
3. **ROIC vs WACC** — Assess economic value creation
4. **Technical Analysis** — ASCII price chart, SMA 20/50/200, RSI(14), 52-week range, trend signal
5. **Valuation** — Three methods: (a) comparable company multiples, (b) DCF with bear/base/bull, (c) PEG ratio
6. **Competitive Moat** — Rate moat dimensions 1–5, identify durable vs. fragile advantages
7. **Risk Matrix** — Probability × Impact grid with mitigants
8. **Investment Decision** — Composite scorecard, entry/target/stop levels, time horizon

## How to invoke

```
/stock-eval AAPL
/stock-eval NVDA --deep
/us-stock-analysis:stock-eval NFLX
```

## Implementation

This skill calls the analysis scripts in `US_Stocks/`:

```bash
node /Users/kcw/Documents/US_Stocks/scripts/stock-eval.js $SYMBOL
```

Then augments the script output with the full institutional narrative using Claude's knowledge of:
- Business model and competitive dynamics
- Sector context and peer benchmarks
- Historical valuation ranges
- Macro risk factors specific to the company

## Output Format

### I. Executive Summary
Price, market cap, analyst consensus target, today's % change, drawdown from 52w high.

### II. Technical Analysis
ASCII price chart (52 weeks), SMA 20/50/200, RSI gauge, trend signal.

### III. Fundamental Analysis
A. Income Statement Quality — margin table vs sector benchmarks
B. Balance Sheet — liquidity, leverage, capital efficiency
C. Piotroski F-Score — all 9 criteria, total score

### IV. Valuation Summary

1. **Valuation Summary** — Fair value range ($X – $Y)
2. **Methodology** — DCF (primary) + comps (secondary) + ROIC/WACC (sanity check)
3. **Scenarios** — Bull / Base / Bear with distinct revenue CAGR, margin, WACC, terminal growth
4. **Sensitivity Analysis** — 3×3 grid: WACC (±1%) × Revenue Growth (±2%)
5. **Margin of Safety** — Discount/premium to fair value; flag SAFE / FAIR / EXPENSIVE
6. **Investment Signal Block** — RATING / ENTRY / TARGET / STOP / HORIZON

### V. Competitive Moat
★1–5 per dimension. NARROW / WIDE / NONE overall.

### VI. Risk Matrix
Probability × Impact grid. Mitigant for each high-impact risk.

### VII. 10-K Key Signals *(--deep only)*

### VIII. Investment Decision
One-paragraph plain-English bottom line.

## Peer comparison benchmarks

| Sector | P/E | Fwd P/E | Op Margin | Rev Growth |
|--------|-----|---------|-----------|------------|
| Tech (large cap) | 28x | 24x | 25% | 12% |
| Streaming/Media | 22x | 18x | 15% | 8% |
| Semiconductors | 35x | 28x | 30% | 20% |
| Financials | 14x | 12x | 30% | 6% |
| Healthcare | 20x | 17x | 18% | 8% |

## Example

> Analyze Apple (AAPL) using the stock-eval framework

```
Fetching data for AAPL...

=== Apple Inc. (AAPL) — Institutional Research Report ===
Recommendation: BUY  |  Target: $237.45

── SIGNAL BLOCK ──────────────────────────────────────────
  Price:         $211.28  (+1.12%)
  Market Cap:    $3.21T
  52w Range:     $169.21 – $237.49
  From 52w High: -11.07%
  RSI (14):      54.2  ✦ NEUTRAL
  Trend:         Price > SMA20 ($208) > SMA50 ($202) > SMA200 ($196)
                 → BULLISH alignment (all three MAs stacked)

── PIOTROSKI F-SCORE ─────────────────────────────────────
  Profitability:   ✅✅✅✅  (4/4)
  Leverage:        ✅✅✅   (3/3)
  Efficiency:      ✅✅    (2/2)
  TOTAL:           9 / 9  ★ STRONG BUY SIGNAL

── KEY METRICS ───────────────────────────────────────────
  P/E TTM:         33.2x    Forward P/E:  28.1x
  PEG Ratio:        1.6x    ROE:          160.1%
  Gross Margin:    46.2%    Op Margin:     31.5%
  Rev Growth:       6.1%    FCF Yield:      3.2%
  Debt/Equity:     148x     Current Ratio:  0.95

── VALUATION ─────────────────────────────────────────────
  Comps:   Premium justified — only mega-cap with >30% op margin
           and hardware ecosystem lock-in (switching cost moat)
  DCF:     Bear $178 | Base $224 | Bull $290
           → Currently at Base, 30% upside to bull
  ROIC:    ~55% vs WACC ~9% → Spread +46% (exceptional)

── MOAT ──────────────────────────────────────────────────
  iPhone ecosystem lock-in:   ★★★★★
  Services flywheel:          ★★★★★
  Brand premium:              ★★★★★
  Supply chain control:       ★★★★☆
  Vision Pro / wearables:     ★★★☆☆
  OVERALL: WIDE MOAT

── DECISION ──────────────────────────────────────────────
  RATING:  BUY
  ENTRY:   $200–215 (current zone)
  TARGET:  $237 (12-month consensus)
  STOP:    $185 (below SMA200 = trend break)
  HORIZON: 12–18 months
──────────────────────────────────────────────────────────
```

## Notes

- All data is fetched live from Yahoo Finance at time of invocation — results will differ from this example
- DCF uses base WACC 9%, terminal growth 3–4%; adjust mentally for rate environment
- Piotroski criteria are applied to trailing twelve months (TTM) figures
- RSI thresholds: overbought >70 | oversold <30 | extreme oversold <20 | extreme overbought >80
- Debt/Equity can appear very high for capital-light companies with share buybacks reducing book equity (e.g. AAPL, NFLX) — cross-reference with absolute debt levels and interest coverage
- Yahoo Finance v10 API wraps numeric values as `{ raw, fmt }` objects; the skill unwraps these automatically
- **Use this skill when:** you want a complete, single-pass institutional view before a buy/sell/hold decision
- **Use `stock-screen` instead when:** comparing multiple tickers quickly across a watchlist
- **Use `--deep` when:** preparing for earnings, position sizing, or writing an investment memo

---

**Framework Version**: 1.0
**Last Updated**: 2026-05-07
**Status**: Active
