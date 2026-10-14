#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getQuote, getSummary, getHistory, getHistoryFull,
  getOptionsWithDteFloor, getCalendar,
} from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';
import { buildMarkdownReport } from '../src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const reportsDir = path.join(ROOT, 'reports');
const logsDir = path.join(ROOT, 'logs');

// ── Config ─────────────────────────────────────────────────────────────────────
const CONVICTION_THRESHOLD = 3.5;
const BRIEFING_TOP_N = 5;

// ── Structured logger ──────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const logLines = [];
const ICONS = { INFO: '  ', WARN: '⚠ ', ERROR: '✗ ', OK: '✓ ' };

function log(level, msg, extra = null) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (extra) entry.extra = extra;
  logLines.push(JSON.stringify(entry));
  process.stdout.write(`${ICONS[level] ?? '  '}${msg}\n`);
}

function flushLog() {
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `scanner_${today}.log`);
  fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');
  log('INFO', `Log written → ${logPath}`);
}

// ── Data quality validation ────────────────────────────────────────────────────
// Returns an array of issue strings. Empty = clean data.
function validateResult(quote, opts) {
  const issues = [];
  if (!quote.regularMarketPrice || quote.regularMarketPrice <= 0) {
    issues.push('STALE_QUOTE');
  }
  if (opts) {
    if (opts.iv1 == null) issues.push('MISSING_IV');
    if (opts.missingBidWarning) issues.push('MISSING_BIDS');
    const usable = opts.chainRows?.filter(r => r.callPrice != null || r.putPrice != null).length ?? 0;
    if (usable === 0) issues.push('NO_USABLE_CHAIN');
  }
  return issues;
}

// ── Conviction scoring ─────────────────────────────────────────────────────────
// Composite of signalBlock score + TA rating + analyst upside + options skew.
// Threshold 3.5 ≈ mildly bullish fundamentals + neutral TA, or neutral fundamentals + bullish TA.
function scoreConviction(sigs, ta, val, opts) {
  let score = sigs.score;

  if (ta) {
    if (ta.rating === 'BULLISH') score += 2;
    else if (ta.rating === 'BEARISH') score -= 2;
  }

  if (val.upside != null) {
    if (val.upside > 25) score += 1;
    else if (val.upside < -10) score -= 1;
  }

  if (opts?.pcr != null) {
    if (opts.pcr < 0.6) score += 0.5;   // call-heavy OI → bullish positioning
    else if (opts.pcr > 1.5) score -= 0.5; // put-heavy OI → bearish hedge
  }
  if (opts?.earningsNear && opts?.highIV) score += 0.5; // premium-selling opportunity

  return +score.toFixed(2);
}

// ── Per-ticker pipeline ────────────────────────────────────────────────────────
async function analyzeOne(symbol) {
  const [quote, summary, history, histFull, optData, calendar] = await Promise.all([
    getQuote(symbol),
    getSummary(symbol),
    getHistory(symbol),
    getHistoryFull(symbol),
    getOptionsWithDteFloor(symbol, 7).catch(e => {
      log('WARN', `${symbol} options skipped: ${e.message}`);
      return null;
    }),
    getCalendar(symbol).catch(e => {
      log('WARN', `${symbol} calendar skipped: ${e.message}`);
      return null;
    }),
  ]);

  const fund = fundamentals(summary, quote);
  const tech = technicals(history);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const hist = incomeHistory(summary);
  const ta   = computeTechnicals(quote, histFull);
  const opts = optData ? computeOptions(quote, optData, calendar) : null;

  const issues = validateResult(quote, opts);
  if (issues.length) log('WARN', `${symbol} data issues: ${issues.join(', ')}`);

  const conviction = scoreConviction(sigs, ta, val, opts);
  return { symbol, fund, val, sigs, hist, ta, opts, issues, conviction };
}

// ── Main ───────────────────────────────────────────────────────────────────────
const watchlistPath = path.join(ROOT, 'watchlist.json');
if (!fs.existsSync(watchlistPath)) {
  console.error('watchlist.json not found — create it with {"tickers":["AAPL","MSFT",...]}');
  process.exit(1);
}

const { tickers } = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
if (!tickers?.length) {
  console.error('watchlist.json: tickers array is empty');
  process.exit(1);
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

log('INFO', `Daily scan started — ${tickers.length} tickers`);
const scanStart = Date.now();

const settled = await Promise.allSettled(
  tickers.map(t => analyzeOne(t.toUpperCase()))
);

const results = [];
const failures = [];

for (let i = 0; i < settled.length; i++) {
  const s = settled[i];
  const sym = tickers[i].toUpperCase();
  if (s.status === 'fulfilled') {
    const r = s.value;
    results.push(r);
    log('OK', `${sym}  conviction=${r.conviction}  signal=${r.sigs.overall}  TA=${r.ta?.rating ?? 'N/A'}`);
  } else {
    failures.push({ symbol: sym, error: s.reason?.message ?? String(s.reason) });
    log('ERROR', `${sym}: ${s.reason?.message ?? s.reason}`, { stack: s.reason?.stack });
  }
}

results.sort((a, b) => b.conviction - a.conviction);

// Full institutional reports for tickers that cross the threshold
const highConviction = results.filter(r => r.conviction >= CONVICTION_THRESHOLD);
for (const r of highConviction) {
  const report = buildMarkdownReport({
    symbol: r.symbol, fund: r.fund, val: r.val,
    sigs: r.sigs, hist: r.hist, ta: r.ta, opts: r.opts,
  });
  const outPath = path.join(reportsDir, `${r.symbol}_${today}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
  log('OK', `${r.symbol} full report → ${outPath}`);
}

// ── Morning briefing ───────────────────────────────────────────────────────────
const top = results.slice(0, BRIEFING_TOP_N);
const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
const dateStr = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
});

const lines = [];
lines.push(`# Morning Market Briefing — ${dateStr}`);
lines.push('');
lines.push(`> Scanned **${tickers.length} tickers** in ${elapsed}s. **${highConviction.length}** exceeded conviction threshold (${CONVICTION_THRESHOLD}). **${failures.length}** failed.`);
lines.push('');

// Summary leaderboard
lines.push('## Top Setups');
lines.push('');
lines.push('| # | Ticker | Price | Signal | Conviction | TA | Options Strategy | Data |');
lines.push('|---|---|---|---|---|---|---|---|');
for (let i = 0; i < top.length; i++) {
  const r = top[i];
  const price = r.fund.price != null ? `$${r.fund.price}` : 'N/A';
  const strat = r.opts?.strategy?.name ?? '—';
  const ta = r.ta?.rating ?? 'N/A';
  const data = r.issues.length ? `⚠ ${r.issues.join(', ')}` : '✓ clean';
  const fullReport = r.conviction >= CONVICTION_THRESHOLD ? ' 📄' : '';
  lines.push(`| ${i + 1} | **${r.symbol}**${fullReport} | ${price} | ${r.sigs.overall} | ${r.conviction} | ${ta} | ${strat} | ${data} |`);
}
lines.push('');
lines.push('_📄 = full institutional report generated_');
lines.push('');

// Per-ticker detail blocks
for (const r of top) {
  const price = r.fund.price != null ? `$${r.fund.price}` : 'N/A';
  const cap = r.fund.marketCap ?? 'N/A';
  lines.push(`## ${r.symbol} — ${r.sigs.overall} (conviction: ${r.conviction})`);
  lines.push('');
  lines.push(`**Price:** ${price} | **Market Cap:** ${cap} | **TA:** ${r.ta?.rating ?? 'N/A'} | **Analyst:** ${r.fund.recommendation?.toUpperCase().replace('_', ' ') ?? 'N/A'}`);
  lines.push('');

  // Top signals only (first 5, bullish/bearish, skip neutral clutter)
  const keySigs = r.sigs.signals.filter(s => s.verdict !== 'neutral').slice(0, 5);
  if (keySigs.length) {
    for (const s of keySigs) {
      const icon = s.verdict === 'bullish' ? '▲' : '▼';
      lines.push(`- ${icon} ${s.label}`);
    }
    lines.push('');
  }

  if (r.opts) {
    const iv = r.opts.iv1 != null ? `${(r.opts.iv1 * 100).toFixed(1)}%` : 'N/A';
    const straddle = r.opts.straddle != null
      ? `$${r.opts.straddle.toFixed(2)} (±${r.opts.straddlePct.toFixed(1)}%)`
      : 'N/A';
    lines.push(`**Options (${r.opts.expiry1}, ${r.opts.dte1} DTE):** IV ${iv} (${r.opts.ivEnv}) | Straddle ${straddle} | PCR ${r.opts.pcr?.toFixed(2) ?? 'N/A'} | Max Pain $${r.opts.mp ?? 'N/A'}`);
    lines.push('');
    lines.push(`**Strategy:** ${r.opts.strategy.name} — ${r.opts.strategy.legs}`);
    lines.push(`> ${r.opts.strategy.rationale}`);
    lines.push('');
    if (r.opts.daysToEarnings != null && r.opts.daysToEarnings >= 0 && r.opts.daysToEarnings <= 35) {
      lines.push(`> ⚠ Earnings in **${r.opts.daysToEarnings} days**`);
      lines.push('');
    }
  }

  if (r.val.upside != null) {
    const sign = r.val.upside >= 0 ? '+' : '';
    lines.push(`**Analyst target:** $${r.val.targetPrice} (${sign}${r.val.upside}% upside)`);
    lines.push('');
  }

  if (r.conviction >= CONVICTION_THRESHOLD) {
    lines.push(`> Full report: \`reports/${r.symbol}_${today}.md\``);
    lines.push('');
  }

  if (r.issues.length) {
    lines.push(`> ⚠ Data warnings: ${r.issues.join(', ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
}

// Failure summary
if (failures.length) {
  lines.push('## Failed Tickers');
  lines.push('');
  for (const f of failures) {
    lines.push(`- **${f.symbol}**: ${f.error}`);
  }
  lines.push('');
}

// Data quality summary
const withIssues = results.filter(r => r.issues.length > 0);
if (withIssues.length) {
  lines.push('## Data Quality Warnings');
  lines.push('');
  lines.push('| Ticker | Issues |');
  lines.push('|---|---|');
  for (const r of withIssues) {
    lines.push(`| ${r.symbol} | ${r.issues.join(', ')} |`);
  }
  lines.push('');
}

lines.push(`---`);
lines.push(`_Generated ${new Date().toISOString()} · Conviction threshold: ${CONVICTION_THRESHOLD} · Top N: ${BRIEFING_TOP_N}_`);

const briefingPath = path.join(reportsDir, `briefing_${today}.md`);
fs.writeFileSync(briefingPath, lines.join('\n'), 'utf8');
log('OK', `Briefing → ${briefingPath}`);

// Print failure summary to stderr so CI surfaces it
if (failures.length) {
  process.stderr.write(`\n⚠  ${failures.length} ticker(s) failed:\n`);
  for (const f of failures) {
    process.stderr.write(`   ${f.symbol}: ${f.error}\n`);
  }
  process.stderr.write('\n');
}

flushLog();

// Exit 1 only if every ticker failed — partial success is still a usable run
if (failures.length > 0 && results.length === 0) {
  process.exitCode = 1;
}
