# GitHub Copilot Instructions — InvestSkill

## Project overview

InvestSkill is a multi-platform AI skill plugin for institutional-grade US stock analysis. It provides consistent analysis behavior across Claude Code, Cursor, GitHub Copilot, and Gemini.

## Available skills

### `/stock-eval <SYMBOL>`

Produces a complete institutional research report including:
- Live data from Yahoo Finance (price, fundamentals, 1-year history)
- Piotroski F-Score (9 criteria)
- ROIC vs WACC economic spread
- Technical analysis with ASCII chart, SMA 20/50/200, RSI(14)
- Valuation: comparable multiples + DCF (bear/base/bull) + PEG
- Competitive moat scorecard (★ rating per dimension)
- Risk matrix (probability × impact)
- Investment decision with entry/target/stop/horizon

**Usage:**
```
/stock-eval AAPL
/stock-eval NVDA --deep
```

**Backend:** Calls `node /Users/kcw/Documents/US_Stocks/scripts/stock-eval.js {SYMBOL}`

## Code style

- Node.js 18+, ES modules
- Native `fetch()` for HTTP — no axios/got
- Yahoo Finance API: `query1.finance.yahoo.com/v8/finance/chart` and `v10/finance/quoteSummary`
- Crumb-based session auth via `fc.yahoo.com` → `v1/test/getcrumb`

## Adding a new skill

See `.cursor/rules/invest-skill.mdc` for the full checklist.
Key files to create/update: SKILL.md, prompts/, plugin.json, this file, GEMINI.md, README.md, CHANGELOG.md.
