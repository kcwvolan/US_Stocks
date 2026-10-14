---
name: technical-analysis
description: Advanced technical analysis — 52-week ASCII chart, SMA/EMA, MACD, RSI(14), Bollinger Bands, ATR, Stochastic, pivot points, and volume confirmation. Returns overall technical rating with entry/stop levels.
triggers:
  - /technical-analysis
  - /us-stock-analysis:technical-analysis
args:
  - name: symbol
    description: US stock ticker symbol (e.g. NVDA, AAPL, TSLA)
    required: true
  - name: --chart
    description: Render 52-week ASCII price chart with SMA20/50/200 overlays
    required: false
---

# technical-analysis skill

## What this skill does

Given a US ticker, runs a full technical analysis covering:

1. **Moving Averages** — SMA 20/50/200 and EMA 12/26. Trend alignment check (all stacked bullish/bearish or mixed).
2. **Momentum** — RSI(14) with overbought/oversold flags, MACD line/signal/histogram, Stochastic %K/%D.
3. **Volatility** — Bollinger Bands (20,2) with %B position, ATR(14) as % of price.
4. **Support / Resistance** — Daily pivot points (R2/R1/Pivot/S1/S2), 52-week high/low, drawdown from high.
5. **Volume** — Today vs. 20-day average, conviction signal.
6. **Signal Summary** — Star-rated composite across Trend / Momentum / Volatility / Volume → BULLISH / NEUTRAL / BEARISH with entry zone and stop level.
7. **ASCII Chart** *(--chart flag)* — 72-column price chart with SMA overlays, 52-week span.

## How to invoke

```
/technical-analysis NVDA
/technical-analysis AAPL --chart
/us-stock-analysis:technical-analysis TSLA --chart
```

## Implementation

```bash
node /Users/kcw/Documents/AI_Workplace/US_Stocks/scripts/technical-analysis.js $SYMBOL [--chart]
```

## Output sections

### Signal Header
Current price, 1-day change, RSI value + label, trend direction.

### Moving Averages
SMA 20/50/200 and EMA 12/26. % above/below each MA. Trend alignment verdict.

### Momentum
RSI bar gauge, MACD histogram direction, Stochastic %K/%D with overbought/oversold flags.

### Volatility
Bollinger Band upper/middle/lower, %B position, ATR(14) in dollar + % terms.

### Support / Resistance
Pivot points (daily), 52-week range, % from 52w high and low.

### Volume
Today vs. 20-day average. Conviction label (CONFIRMING / WEAK / NEUTRAL).

### Signals Summary
Star ratings for each dimension. Overall BULLISH / NEUTRAL / BEARISH. Entry zone and stop level.

## RSI thresholds

| Value | Label |
|-------|-------|
| ≥ 80  | EXTREME OVERBOUGHT ⚠ |
| 70–79 | OVERBOUGHT |
| 30–69 | NEUTRAL |
| 21–30 | OVERSOLD |
| ≤ 20  | EXTREME OVERSOLD ⚠ |

## Trend alignment rules

- **ALL BULLISH**: price > SMA20 > SMA50 > SMA200
- **ALL BEARISH**: price < SMA20 < SMA50 < SMA200
- **MIXED**: any other configuration

## Peer comparison for sector context

After script output, add a brief read on whether the technical setup is strong/weak vs. the sector and any key pattern (breakout, cup & handle, resistance test).

---

**Framework Version**: 1.0
**Last Updated**: 2026-05-07
**Status**: Active
