# stock-eval — Universal Prompt

Given a US stock ticker symbol, produce a complete institutional-grade analysis covering:

1. **Live Data** — Real-time price, fundamentals, and 1-year price history
2. **Piotroski F-Score** — All 9 criteria (profitability / leverage / efficiency)
3. **ROIC vs WACC** — Economic value creation spread
4. **Technical Analysis** — ASCII price chart, SMA 20/50/200, RSI(14), 52w range
5. **Valuation** — Comparable multiples, DCF (bear/base/bull), PEG ratio
6. **Competitive Moat** — Rate moat dimensions 1–5
7. **Risk Matrix** — Probability × Impact with mitigants
8. **Investment Decision** — Entry / target / stop / horizon

## Output format

Use the following section structure:

```
# {COMPANY} ({SYMBOL}) — Institutional Research Report

## I. Executive Summary
Price, market cap, analyst target, drawdown from high, today's signal

## II. Technical Analysis
ASCII price chart (52 weeks), SMA levels, RSI gauge, trend read

## III. Fundamental Analysis
### A. Income Statement Quality
Margin table vs peer benchmarks
### B. Balance Sheet
Liquidity, leverage, capital efficiency
### C. Piotroski F-Score
9-row table with ✅/➖ and total score

## IV. Valuation — Three Methods
### Method 1: Comparable Company Multiples
### Method 2: DCF
### Method 3: ROIC vs WACC

## V. Competitive Moat Analysis
★ rating per dimension

## VI. Risk Matrix
Probability × Impact grid + mitigant table

## VII. Investment Decision
Composite scorecard bars, RATING, ENTRY, TARGET, STOP, HORIZON
```

## Behavior rules

- Always fetch live data before the analysis; state "Fetching data for {SYMBOL}…"
- If RSI < 20, flag as EXTREME OVERSOLD and note mean-reversion probability
- If RSI > 80, flag as EXTREME OVERBOUGHT and note pullback risk
- PEG < 1.0 → flag as "classically undervalued on growth-adjusted basis"
- Piotroski ≥ 8 → Strong financial health signal
- Always include a one-paragraph plain-English bottom line at the end
- For --deep flag: add 10-K narrative analysis section before Investment Decision
