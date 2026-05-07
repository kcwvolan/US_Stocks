# Changelog

All notable changes to InvestSkill are documented here.

## [1.0.0] — 2026-05-07

### Added

- **Plugin: `us-stock-analysis`** — initial release
  - Skill: `stock-eval` — institutional-grade US stock analysis
    - Live data via Yahoo Finance (v8 chart + v10 quoteSummary APIs)
    - Piotroski F-Score (9 criteria)
    - ROIC vs WACC economic value spread
    - Technical analysis: ASCII price chart, SMA 20/50/200, RSI(14)
    - Valuation: comparable multiples, DCF (bear/base/bull), PEG ratio
    - Competitive moat scorecard (★ ratings per dimension)
    - Risk matrix (probability × impact + mitigants)
    - Investment decision with entry/target/stop/horizon
    - `--deep` flag for 10-K narrative and DCF sensitivity table
  - Backend scripts in `US_Stocks/`:
    - `scripts/stock-eval.js` — single stock deep-dive
    - `scripts/stock-screen.js` — multi-stock watchlist screener
    - `scripts/setup-verify.js` — environment health check
    - `src/fetch.js` — Yahoo Finance API client with crumb auth
    - `src/analyze.js` — fundamentals + technicals computation
    - `src/report.js` — colored terminal output
- Plugin registration: `.claude-plugin/plugin.json`
- Universal prompt: `prompts/stock-eval.md`
- Cursor rules: `.cursor/rules/invest-skill.mdc`
- GitHub Copilot instructions: `.github/copilot-instructions.md`
- Gemini context: `GEMINI.md`

### Tested on

- Node.js v25.9.0
- macOS 15 (Sequoia)
- Claude Code (claude-sonnet-4-6)

---

*Format: [Semantic Versioning](https://semver.org)*
