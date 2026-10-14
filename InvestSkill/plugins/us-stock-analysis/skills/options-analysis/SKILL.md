---
name: options-analysis
description: Options chain analysis — IV environment, expected move from ATM straddle, put/call ratio, max pain, strategy recommendations based on IV rank and earnings timing. Add --earnings for earnings-event playbook.
triggers:
  - /options-analysis
  - /us-stock-analysis:options-analysis
args:
  - name: symbol
    description: US stock ticker symbol (e.g. NVDA, AAPL, TSLA)
    required: true
  - name: --earnings
    description: Focus analysis on the upcoming earnings event — deeper IV crush analysis and earnings-specific trade sizing
    required: false
---

# options-analysis skill

## What this skill does

Given a US ticker, fetches the live options chain from Yahoo Finance and provides:

1. **IV Environment** — ATM implied volatility for front two expirations. Term structure (contango vs. backwardation). IV level label (LOW / MODERATE / HIGH / VERY HIGH).
2. **Expected Move** — ATM straddle price = market's implied ±move to expiration. Shows dollar range and %.
3. **Options Chain Table** — ATM ±3 strikes for nearest expiry. Bid/ask, IV, and put/call OI ratio per strike.
4. **Put/Call Ratio** — total put OI ÷ call OI. Sentiment signal.
5. **Max Pain** — strike where combined option holder losses are maximized at expiration. Price gravity.
6. **Strategy Recommendations** — primary strategy + 4 alternatives, selected based on IV level and earnings proximity:
   - **High IV + earnings near** → Iron Condor (sell IV crush)
   - **Low IV + earnings near** → Long Straddle (buy cheap convexity)
   - **High IV, no event** → Covered Call / Cash-Secured Put
   - **Normal** → Bull Call Spread
7. **Earnings Deep Dive** *(--earnings flag)* — pre/post-earnings IV dynamics, implied move vs. historical, sizing rules, entry/exit timing.

## How to invoke

```
/options-analysis NVDA
/options-analysis TSLA --earnings
/us-stock-analysis:options-analysis AAPL --earnings
```

## Implementation

```bash
node /Users/kcw/Documents/AI_Workplace/US_Stocks/scripts/options-analysis.js $SYMBOL [--earnings]
```

## Strategy selection logic

| IV Level | Earnings ≤ 35d? | Primary Strategy |
|----------|-----------------|------------------|
| HIGH     | Yes             | Iron Condor      |
| LOW      | Yes             | Long Straddle    |
| HIGH     | No              | Covered Call / CSP |
| LOW/MOD  | No              | Bull Call Spread |

## IV level thresholds

| ATM IV  | Label     |
|---------|-----------|
| > 70%   | VERY HIGH |
| 45–70%  | HIGH      |
| 25–45%  | MODERATE  |
| < 25%   | LOW       |

## Earnings playbook (--earnings flag)

- Straddle entry: 3–5 days before earnings (before last-day IV spike)
- Straddle exit: day of earnings close, before announcement
- Iron condor: open 2–3 weeks out at high IV; close day before earnings
- Max position size: 2–3% portfolio risk per earnings trade

## Data source

Yahoo Finance v7 options endpoint. Requires crumb session auth. Some tickers (ETFs, foreign ADRs) may not have options chains — the skill exits gracefully with a note.

## Notes

- Implied volatility from Yahoo Finance is the annualized IV solved by Black-Scholes
- Expected move = ATM call mid + ATM put mid (model-free approximation)
- Max pain calculated from open interest across all listed strikes
- After script output, add brief commentary on top trade setup, Greeks impact, and position sizing

---

**Framework Version**: 1.0
**Last Updated**: 2026-05-07
**Status**: Active
