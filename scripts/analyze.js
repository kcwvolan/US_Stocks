#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getQuote, getSummary, getHistory, getHistoryFull, getOptionsWithDteFloor, getCalendar } from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';
import { buildMarkdownReport } from '../src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.resolve(__dirname, '..', 'reports');

const args = process.argv.slice(2);
const symbols = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());

if (!symbols.length) {
  console.error('Usage: node scripts/analyze.js <SYMBOL> [SYMBOL...]');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.mkdirSync(reportsDir, { recursive: true });

for (const symbol of symbols) {
  process.stdout.write(`\nAnalyzing ${symbol}...`);
  try {
    const [quote, summary, history, histFull, optData, calendar] = await Promise.all([
      getQuote(symbol),
      getSummary(symbol),
      getHistory(symbol),
      getHistoryFull(symbol),
      getOptionsWithDteFloor(symbol, 7).catch(() => null),
      getCalendar(symbol).catch(() => null),
    ]);

    const fund = fundamentals(summary, quote);
    const tech = technicals(history);
    const val  = valuationAnalysis(fund);
    const sigs = signalBlock(fund, tech);
    const hist = incomeHistory(summary);
    const ta   = computeTechnicals(quote, histFull);
    const opts = optData ? computeOptions(quote, optData, calendar) : null;

    const report = buildMarkdownReport({ symbol, fund, val, sigs, hist, ta, opts });

    const outPath = path.join(reportsDir, `${symbol}_${today}.md`);
    fs.writeFileSync(outPath, report, 'utf8');
    console.log(` ✓  ${outPath}`);
  } catch (err) {
    console.error(` ✗  ${symbol}: ${err.message}`);
  }
}
