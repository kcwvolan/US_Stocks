import { getQuote, getSummary, getHistory } from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { printReport, printDeep } from '../src/report.js';

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const symbols = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase());

if (!symbols.length) {
  console.error('Usage: node scripts/stock-eval.js <SYMBOL> [SYMBOL...] [--deep]');
  process.exit(1);
}

for (const symbol of symbols) {
  console.log(`\nFetching data for ${symbol}...`);
  try {
    const [quote, summary, history] = await Promise.all([
      getQuote(symbol),
      getSummary(symbol),
      getHistory(symbol),
    ]);

    const fund = fundamentals(summary, quote);
    const tech = technicals(history);
    printReport(fund, tech);

    if (deep) {
      const val = valuationAnalysis(fund);
      const sigs = signalBlock(fund, tech);
      const hist = incomeHistory(summary);
      printDeep(val, sigs, hist);
    }
  } catch (err) {
    console.error(`  Error fetching ${symbol}: ${err.message}`);
  }
}
