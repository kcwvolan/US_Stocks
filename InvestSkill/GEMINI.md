# GEMINI.md — InvestSkill

## Project

InvestSkill provides institutional-grade US stock analysis as a portable AI skill. The same analysis logic runs across Claude Code, Gemini, Cursor, and GitHub Copilot via shared prompt definitions.

## Available skills

### stock-eval

**Trigger:** `/stock-eval <TICKER>`
**Prompt source:** `prompts/stock-eval.md`

Produces a full institutional research report:
1. Executive summary (price, cap, target, drawdown)
2. Technical analysis with ASCII price chart
3. Fundamental analysis (margins, balance sheet, Piotroski F-Score)
4. Valuation — three methods (comps, DCF, ROIC/WACC)
5. Competitive moat scorecard
6. Risk matrix
7. Investment decision (entry / target / stop / horizon)

**To invoke in Gemini:**
> Use the prompt in `prompts/stock-eval.md` with SYMBOL = {ticker}

## Data source

Yahoo Finance via:
- `query1.finance.yahoo.com/v8/finance/chart/{symbol}` — price & history
- `query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}` — fundamentals
- Session crumb required for quoteSummary (fetch from `fc.yahoo.com` → `v1/test/getcrumb`)

## Adding a new skill

Follow the checklist in `.cursor/rules/invest-skill.mdc`.
