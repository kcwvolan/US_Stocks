---
description: Institutional-grade US stock analysis — fundamentals, technicals, DCF valuation, Piotroski F-Score, moat, and risk matrix
argument-hint: <SYMBOL> [--deep]
allowed-tools: [Bash, Read]
---

# US Stock Analysis — Institutional Research Report

The user has invoked `/us-stock-analysis:my-analysis` with arguments: $ARGUMENTS

## Your task

Parse `$ARGUMENTS` to extract:
- `SYMBOL` — the ticker (required, e.g. AAPL, NVDA, NOK)
- `--deep` flag — if present, add 10-K narrative and DCF sensitivity table

Then run:

```bash
node /Users/kcw/Documents/AI_Workplace/US_Stocks/scripts/stock-eval.js SYMBOL
```

Use the Bash tool to execute it with the actual symbol from $ARGUMENTS.

## After fetching live data, produce a full institutional report:

### I. Executive Summary
Price, market cap, analyst consensus target, today's % change, drawdown from 52w high.

### II. Technical Analysis
ASCII price chart (52 weeks) showing price vs SMA 20/50/200.
RSI gauge. Trend signal (bullish / bearish / neutral alignment).

### III. Fundamental Analysis
**A. Income Statement Quality** — margin table vs peer sector benchmarks
**B. Balance Sheet** — liquidity, leverage, capital efficiency
**C. Piotroski F-Score** — all 9 criteria with ✅/➖ and total score

### IV. Valuation

Produce all six components below in order:

**1. Valuation Summary** — Fair value range
```
Fair Value Range:  $X – $Y
Current Price:     $Z
Margin of Safety:  ±N%
```

**2. Methodology** — State which methods were used and why:
- DCF (primary): assumptions — FCF base, growth rates, WACC, terminal rate
- Comparable multiples (secondary): P/E, EV/EBITDA vs sector peers
- ROIC/WACC spread (sanity check): confirms value creation direction

**3. Scenarios** — Bull / Base / Bear with distinct assumptions:

| Scenario | Revenue CAGR | Op Margin | WACC | Terminal g | Implied Value |
|----------|-------------|-----------|------|------------|---------------|
| Bull     | ...%        | ...%      | ...% | ...%       | $...          |
| Base     | ...%        | ...%      | ...% | ...%       | $...          |
| Bear     | ...%        | ...%      | ...% | ...%       | $...          |

**4. Sensitivity Analysis** — How the base-case value moves with key inputs:

| | WACC –1% | WACC Base | WACC +1% |
|---|---|---|---|
| Growth +2% | $... | $... | $... |
| Growth Base | $... | $... | $... |
| Growth –2% | $... | $... | $... |

**5. Margin of Safety**
```
Fair Value (base):   $...
Current Price:       $...
Discount / Premium:  ...%   [SAFE / FAIR / EXPENSIVE]
```
Flag: ≥30% discount = strong MoS | 10–30% = moderate | <10% = limited | negative = overvalued

**6. Investment Signal Block**
```
RATING:   [STRONG BUY / BUY / HOLD / SELL / STRONG SELL]
ENTRY:    $...
TARGET:   $... (+N% to fair value midpoint)
STOP:     $... (thesis broken if breached)
HORIZON:  ... months
```

### V. Competitive Moat
Rate each dimension ★1–5. State NARROW / WIDE / NONE overall.

### VI. Risk Matrix
Probability × Impact grid. Mitigant for each high-impact risk.

### VII. Investment Decision
```
RATING:   [STRONG BUY / BUY / HOLD / SELL]
ENTRY:    $...
TARGET:   $... (... % upside)
STOP:     $... (thesis broken if breached)
HORIZON:  ... months
```
One-paragraph plain-English bottom line.

## Sector benchmarks for comparison

| Sector | P/E | Fwd P/E | Op Margin | Rev Growth |
|--------|-----|---------|-----------|------------|
| Tech (large cap) | 28x | 24x | 25% | 12% |
| Streaming/Media | 22x | 18x | 15% | 8% |
| Semiconductors | 35x | 28x | 30% | 20% |
| Financials | 14x | 12x | 30% | 6% |
| Telecom/Hardware | 16x | 14x | 12% | 4% |
| Healthcare | 20x | 17x | 18% | 8% |

## RSI signal thresholds
- RSI > 80: EXTREME OVERBOUGHT — flag pullback risk
- RSI > 70: Overbought
- RSI 30–70: Neutral
- RSI < 30: Oversold
- RSI < 20: EXTREME OVERSOLD — flag mean-reversion probability
