---
description: Options chain analysis — IV environment, expected move, put/call ratio, max pain, and strategy recommendations. Add --earnings for earnings-focused playbook.
argument-hint: SYMBOL [--earnings]
allowed-tools: Bash
---

Run the options analysis script for the given symbol:

```bash
node /Users/kcw/Documents/AI_Workplace/US_Stocks/scripts/options-analysis.js $ARGUMENTS
```

After the script output, provide a brief institutional interpretation covering:

1. **Top Trade Setup** — specific strikes, expiry, and net debit/credit for the primary recommended strategy.
2. **Greeks in Plain English** — how theta decay, gamma risk, or vega exposure affect the top strategy over the next week.
3. **Risk Scenario** — what happens to the position if the stock moves +10% or −10% from here.
4. **Sizing** — as a % of a $100k portfolio, what is a reasonable allocation for each risk profile (conservative / moderate / aggressive).
