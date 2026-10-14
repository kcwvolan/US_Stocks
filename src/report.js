import chalk from 'chalk';
import Table from 'cli-table3';

// ── Markdown report builder ────────────────────────────────────────────────────

export function buildMarkdownReport({ symbol, fund, val, sigs, hist, ta, opts }) {
  const f2 = n => (n == null ? 'N/A' : typeof n === 'number' ? n.toFixed(2) : String(n));
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const pctSign = n => n >= 0 ? `+${f2(n)}%` : `${f2(n)}%`;
  const lines = [];

  // Header
  lines.push(`# ${fund.name} (${symbol}) — Institutional Report`);
  lines.push(`**Date:** ${date} | **Price:** $${fund.price} (${pctSign(parseFloat(fund.change1d))}) | **Market Cap:** ${fund.marketCap} | **Signal:** ${sigs.score} → ${sigs.overall}`);
  lines.push('');

  // Thesis (data-driven summary)
  lines.push('## Thesis');
  const profitable = parseFloat(fund.eps) > 0;
  const upside = val.upside != null ? ` Analyst consensus target $${val.targetPrice} (${pctSign(val.upside)} upside).` : '';
  lines.push(`${fund.name} is a ${profitable ? 'profitable' : 'pre-profit'} company with ${fund.revenueGrowth} YoY revenue growth and ${fund.grossMargin} gross margins. ${fund.recommendation?.toUpperCase().replace('_', ' ')} rated by analysts.${upside}`);
  lines.push('');
  lines.push('**Key signals:**');
  for (const s of sigs.signals) {
    const icon = s.verdict === 'bullish' ? '▲' : s.verdict === 'bearish' ? '▼' : '●';
    lines.push(`- ${icon} ${s.label}`);
  }
  lines.push('');

  // Fundamentals
  lines.push('## Fundamentals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Price | $${fund.price} (${pctSign(parseFloat(fund.change1d))}) |`);
  lines.push(`| Market Cap | ${fund.marketCap} |`);
  lines.push(`| P/E (TTM) | ${fund.pe} |`);
  lines.push(`| Forward P/E | ${fund.forwardPE} |`);
  lines.push(`| EPS | $${fund.eps} |`);
  lines.push(`| P/B | ${fund.pbRatio} |`);
  lines.push(`| ROE | ${fund.roe} |`);
  lines.push(`| Revenue Growth | ${fund.revenueGrowth} |`);
  lines.push(`| Gross Margin | ${fund.grossMargin} |`);
  lines.push(`| Operating Margin | ${fund.operatingMargin} |`);
  lines.push(`| Debt/Equity | ${fund.debtToEquity} |`);
  lines.push(`| Current Ratio | ${fund.currentRatio} |`);
  lines.push('');

  // Valuation scenarios
  if (val.peScenarios || val.pbScenarios || val.upside != null) {
    lines.push('## Valuation Scenarios');
    lines.push('');
    lines.push('| Scenario | Fair Value |');
    lines.push('|---|---|');
    if (val.peScenarios) {
      lines.push(`| P/E Bear (15x EPS) | $${val.peScenarios.bear} |`);
      lines.push(`| P/E Base (25x EPS) | $${val.peScenarios.base} |`);
      lines.push(`| P/E Bull (40x EPS) | $${val.peScenarios.bull} |`);
    }
    if (val.pbScenarios) {
      lines.push(`| P/B Bear (1.5x Book) | $${val.pbScenarios.bear} |`);
      lines.push(`| P/B Base (2.5x Book) | $${val.pbScenarios.base} |`);
      lines.push(`| P/B Bull (4.0x Book) | $${val.pbScenarios.bull} |`);
    }
    if (val.upside != null) {
      lines.push(`| Analyst Target ($${val.targetPrice}) | ${pctSign(val.upside)} upside |`);
    }
    lines.push('');
  }

  // Income history
  if (hist?.length) {
    lines.push('## Income History (Annual)');
    lines.push('');
    lines.push('| Period | Revenue | Net Income |');
    lines.push('|---|---|---|');
    for (const row of hist) {
      const ni = row.netIncome == null ? 'N/A' : fmtN(row.netIncome);
      lines.push(`| ${row.date} | ${fmtN(row.revenue)} | ${ni} |`);
    }
    lines.push('');
  }

  // Technicals
  if (ta) {
    const f = n => n?.toFixed(2) ?? 'N/A';
    lines.push('## Technicals');
    lines.push('');
    lines.push(`**Trend:** ${ta.rating} | **RSI:** ${f(ta.rsi14)} (${ta.rsiLabel}) | **MACD hist:** ${ta.macdHist != null ? (ta.macdHist >= 0 ? '+' : '') + f(ta.macdHist) : 'N/A'}`);
    lines.push('');
    lines.push('| Metric | Value | vs Price |');
    lines.push('|---|---|---|');
    if (ta.sma20) lines.push(`| SMA 20 | $${f(ta.sma20)} | ${pctSign(((ta.price - ta.sma20) / ta.sma20) * 100)} |`);
    if (ta.sma50) lines.push(`| SMA 50 | $${f(ta.sma50)} | ${pctSign(((ta.price - ta.sma50) / ta.sma50) * 100)} |`);
    if (ta.sma200) lines.push(`| SMA 200 | $${f(ta.sma200)} | ${pctSign(((ta.price - ta.sma200) / ta.sma200) * 100)} |`);
    lines.push(`| 52w High | $${f(ta.high52w)} | ${pctSign(ta.fromHigh)} |`);
    lines.push(`| 52w Low | $${f(ta.low52w)} | +${f(ta.fromLow)}% |`);
    if (ta.bb) lines.push(`| Bollinger %B | ${f((ta.price - ta.bb.lower) / (ta.bb.upper - ta.bb.lower))} | Upper: $${f(ta.bb.upper)} |`);
    if (ta.atr14) lines.push(`| ATR (14) | $${f(ta.atr14)} | ${((ta.atr14 / ta.price) * 100).toFixed(1)}% of price |`);
    if (ta.volRatio != null) lines.push(`| Volume vs 20d avg | ${pctSign((ta.volRatio - 1) * 100)} | ${ta.recentVol > 0 ? (ta.recentVol / 1e6).toFixed(1) + 'M today' : ''} |`);
    lines.push('');
    if (ta.pivots) {
      lines.push(`**Key levels:** R2 $${f(ta.pivots.r2)} | R1 $${f(ta.pivots.r1)} | Pivot $${f(ta.pivots.pivot)} | S1 $${f(ta.pivots.s1)} | S2 $${f(ta.pivots.s2)}`);
      lines.push('');
    }
    lines.push(`**Entry zone:** ${ta.entry} | **Stop:** ${ta.stop}`);
    lines.push('');
  }

  // Options
  if (opts) {
    lines.push('## Options Flow');
    lines.push('');
    if (opts.daysToEarnings != null && opts.daysToEarnings >= 0 && opts.daysToEarnings <= 7) {
      lines.push(`> ⚠️ **Earnings in ${opts.daysToEarnings} days** — binary event risk.`);
      lines.push('');
    }
    lines.push(`**Expiry:** ${opts.expiry1} (${opts.dte1} DTE) | **ATM:** $${opts.atm} | **IV:** ${opts.iv1 != null ? (opts.iv1 * 100).toFixed(1) + '%' : 'N/A'} (${opts.ivEnv})`);
    if (opts.straddle) {
      lines.push(`**ATM Straddle:** $${opts.straddle.toFixed(2)} → implied move ±${opts.straddlePct.toFixed(1)}% ($${(opts.price - opts.straddle).toFixed(2)}–$${(opts.price + opts.straddle).toFixed(2)})`);
    }
    if (opts.pcr != null) lines.push(`**Put/Call OI ratio:** ${opts.pcr.toFixed(2)} (${opts.pcr > 1.3 ? 'bearish hedge demand' : opts.pcr < 0.7 ? 'bullish positioning' : 'neutral'})`);
    lines.push('');
    lines.push('| Strike | Call | Call IV | Put | Put IV |');
    lines.push('|---|---|---|---|---|');
    for (const r of opts.chainRows) {
      const atm = r.isATM ? ' ← ATM' : '';
      lines.push(`| **${r.strike}**${atm} | ${r.callPrice != null ? '$' + r.callPrice.toFixed(2) : 'N/A'} | ${r.callIV != null ? (r.callIV * 100).toFixed(1) + '%' : 'N/A'} | ${r.putPrice != null ? '$' + r.putPrice.toFixed(2) : 'N/A'} | ${r.putIV != null ? (r.putIV * 100).toFixed(1) + '%' : 'N/A'} |`);
    }
    lines.push('');
    lines.push(`**Recommended:** ${opts.strategy.name} — ${opts.strategy.legs}`);
    lines.push(`*${opts.strategy.rationale}*`);
    lines.push('');
  }

  // Risks (data-driven)
  lines.push('## Risks');
  lines.push('');
  const risks = [];
  const de = parseFloat(fund.debtToEquity);
  if (!isNaN(de) && de > 100) risks.push(`**High leverage (D/E ${fund.debtToEquity}):** Refinancing risk if revenue growth disappoints or rates rise.`);
  const cr = parseFloat(fund.currentRatio);
  if (!isNaN(cr) && cr < 1) risks.push(`**Liquidity (current ratio ${fund.currentRatio}):** Current liabilities exceed current assets; dependent on continued capital markets access.`);
  if (parseFloat(fund.eps) < 0) risks.push(`**Pre-profitability (EPS ${fund.eps}):** Losses persist; path to profitability must materialize before leverage becomes structural.`);
  if (opts?.earningsNear) risks.push(`**Earnings event (${opts.daysToEarnings}d away):** Binary outcome risk; options market implies ±${opts.straddlePct?.toFixed(1) ?? '?'}% move.`);
  const rsi = parseFloat(ta?.rsi14);
  if (!isNaN(rsi) && rsi > 70) risks.push(`**Technical overbought (RSI ${rsi.toFixed(1)}):** Elevated pullback probability near-term.`);
  const revG = parseFloat(fund.revenueGrowth);
  if (!isNaN(revG) && revG < 0) risks.push(`**Revenue declining (${fund.revenueGrowth}):** Negative top-line growth compresses the bull narrative.`);
  if (risks.length === 0) risks.push('No major data-flagged risks. Review qualitative factors (competition, regulation, macro) separately.');
  risks.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push('');

  // Price targets
  lines.push('## Price Targets');
  lines.push('');
  lines.push('| Scenario | Price | Basis |');
  lines.push('|---|---|---|');
  if (val.peScenarios) {
    lines.push(`| Bear | $${val.peScenarios.bear} | 15x EPS |`);
    lines.push(`| Base | $${val.peScenarios.base} | 25x EPS |`);
    lines.push(`| Bull | $${val.peScenarios.bull} | 40x EPS |`);
  } else if (val.pbScenarios) {
    lines.push(`| Bear | $${val.pbScenarios.bear} | 1.5x Book |`);
    lines.push(`| Base | $${val.pbScenarios.base} | 2.5x Book |`);
    lines.push(`| Bull | $${val.pbScenarios.bull} | 4.0x Book |`);
  }
  if (val.upside != null) {
    lines.push(`| Analyst consensus | $${val.targetPrice} | ${pctSign(val.upside)} from current |`);
  }
  lines.push('');

  return lines.join('\n');
}

function fmtN(n) {
  if (n == null) return 'N/A';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  return sign + abs.toString();
}

export function printReport(fund, tech) {
  console.log('\n' + chalk.bold.cyan(`=== ${fund.name} (${fund.symbol}) ===`));
  console.log(chalk.gray(`Recommendation: ${colorRec(fund.recommendation)}  |  Target: $${fund.targetPrice}`));

  const t1 = new Table({ head: [chalk.yellow('Metric'), chalk.yellow('Value')] });
  t1.push(
    ['Price', `$${fund.price}  (${colorChange(fund.change1d)}%)`],
    ['Market Cap', fund.marketCap],
    ['P/E (TTM)', fund.pe],
    ['Forward P/E', fund.forwardPE],
    ['EPS', `$${fund.eps}`],
    ['P/B', fund.pbRatio],
    ['ROE', fund.roe],
    ['Revenue Growth', fund.revenueGrowth],
    ['Gross Margin', fund.grossMargin],
    ['Operating Margin', fund.operatingMargin],
    ['Debt/Equity', fund.debtToEquity],
    ['Current Ratio', fund.currentRatio],
  );
  console.log(chalk.bold('\nFundamentals'));
  console.log(t1.toString());

  if (tech) {
    const t2 = new Table({ head: [chalk.yellow('Metric'), chalk.yellow('Value')] });
    t2.push(
      ['SMA 20', `$${tech.sma20}`],
      ['SMA 50', `$${tech.sma50}`],
      ['SMA 200', `$${tech.sma200}`],
      ['RSI (14)', tech.rsi14],
      ['52w High', `$${tech.high52w}`],
      ['52w Low', `$${tech.low52w}`],
      ['From 52w High', `${tech.fromHigh52w}%`],
    );
    console.log(chalk.bold('\nTechnicals (1 Year)'));
    console.log(t2.toString());
  }
  console.log();
}

export function printDeep(val, sigs, hist) {
  // --- Valuation scenarios ---
  console.log(chalk.bold('\nValuation Scenarios'));
  const t1 = new Table({ head: [chalk.yellow('Method / Scenario'), chalk.yellow('Fair Value')] });
  let hasVal = false;
  if (val.peScenarios) {
    t1.push(['P/E Bear (15x EPS)', `$${val.peScenarios.bear}`]);
    t1.push(['P/E Base (25x EPS)', `$${val.peScenarios.base}`]);
    t1.push(['P/E Bull (40x EPS)', `$${val.peScenarios.bull}`]);
    hasVal = true;
  }
  if (val.pbScenarios) {
    t1.push(['P/B Bear (1.5x Book)', `$${val.pbScenarios.bear}`]);
    t1.push(['P/B Base (2.5x Book)', `$${val.pbScenarios.base}`]);
    t1.push(['P/B Bull (4.0x Book)', `$${val.pbScenarios.bull}`]);
    hasVal = true;
  }
  if (val.upside !== null) {
    const u = val.upside >= 0 ? chalk.green(`+${val.upside}%`) : chalk.red(`${val.upside}%`);
    t1.push([`Analyst Target ($${val.targetPrice})`, `Upside: ${u}`]);
    hasVal = true;
  }
  if (hasVal) console.log(t1.toString());
  else console.log(chalk.gray('  No valuation data available.\n'));

  // --- Income history ---
  if (hist?.length) {
    console.log(chalk.bold('\nIncome History (Annual)'));
    const t2 = new Table({
      head: [chalk.yellow('Period'), chalk.yellow('Revenue'), chalk.yellow('Gross Profit'), chalk.yellow('Net Income')],
    });
    for (const row of hist) {
      const ni = row.netIncome;
      const niStr = ni == null ? 'N/A' : ni < 0 ? chalk.red(fmtN(ni)) : chalk.green(fmtN(ni));
      t2.push([row.date, fmtN(row.revenue), fmtN(row.grossProfit), niStr]);
    }
    console.log(t2.toString());
  }

  // --- Signal block ---
  console.log(chalk.bold('\nSignal Block'));
  const t3 = new Table({ head: [chalk.yellow('Signal'), chalk.yellow('Verdict')] });
  for (const s of sigs.signals) {
    let v;
    if (s.verdict === 'bullish') v = chalk.green('▲ Bullish');
    else if (s.verdict === 'bearish') v = chalk.red('▼ Bearish');
    else v = chalk.yellow('● Neutral');
    t3.push([s.label, v]);
  }
  console.log(t3.toString());

  const overallFn = { 'STRONG BUY': chalk.greenBright, BUY: chalk.green, HOLD: chalk.yellow, SELL: chalk.red, 'STRONG SELL': chalk.redBright };
  const colorFn = overallFn[sigs.overall] ?? chalk.white;
  console.log(`  Score: ${sigs.score}  →  ${colorFn.bold(sigs.overall)}\n`);
}

function colorChange(val) {
  const n = parseFloat(val);
  return n >= 0 ? chalk.green(`+${val}`) : chalk.red(val);
}

function colorRec(rec) {
  const map = { buy: chalk.green, strongBuy: chalk.greenBright, hold: chalk.yellow, sell: chalk.red, strongSell: chalk.redBright };
  return (map[rec] ?? chalk.white)(rec.toUpperCase());
}
