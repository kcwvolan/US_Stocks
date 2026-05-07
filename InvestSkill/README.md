# InvestSkill

Institutional-grade US stock analysis as a portable AI skill — works across **Claude Code**, **Cursor**, **GitHub Copilot**, and **Gemini**.

## Features

| Skill | Trigger | What it does |
|-------|---------|-------------|
| **stock-eval** | `/stock-eval <TICKER>` | Full 30–50 page equivalent institutional report |

### stock-eval output

- Live price, fundamentals, and 1-year history via Yahoo Finance
- **Piotroski F-Score** — 9-criterion financial health score
- **ROIC vs WACC** — economic value creation spread
- **Technical analysis** — ASCII chart, SMA 20/50/200, RSI(14), 52w range
- **Valuation** — comparable multiples, DCF (bear/base/bull), PEG ratio
- **Competitive moat** — ★ scorecard per dimension
- **Risk matrix** — probability × impact grid
- **Investment decision** — composite score, entry/target/stop/horizon

## Quick start

### Claude Code

```bash
cd /Users/kcw/Documents/US_Stocks
npm install
node scripts/setup-verify.js

# Then in Claude Code:
/stock-eval AAPL
/stock-eval NVDA --deep
```

### Cursor / Copilot / Gemini

Use the universal prompt at `prompts/stock-eval.md` with your ticker substituted.

## Requirements

- Node.js 18+
- Internet access to Yahoo Finance

## Project structure

```
InvestSkill/
├── plugins/
│   └── us-stock-analysis/
│       ├── skills/
│       │   └── stock-eval/
│       │       └── SKILL.md          ← Claude Code skill definition
│       └── .claude-plugin/
│           └── plugin.json           ← Plugin registration
├── prompts/
│   └── stock-eval.md                 ← Universal prompt (all platforms)
├── .cursor/rules/
│   └── invest-skill.mdc              ← Cursor conventions
├── .github/
│   └── copilot-instructions.md       ← Copilot context
├── GEMINI.md                         ← Gemini context
├── CHANGELOG.md
└── README.md
```

## Adding a new skill

See `.cursor/rules/invest-skill.mdc` for the full checklist — 9 files to create or update.

## License

MIT
