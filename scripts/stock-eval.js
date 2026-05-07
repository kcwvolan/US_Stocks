import { getQuote, getSummary, getHistory } from '../src/fetch.js';
import { fundamentals, technicals } from '../src/analyze.js';
import { printReport } from '../src/report.js';

const symbol = process.argv[2]?.toUpperCase();
if (!symbol) {
  console.error('Usage: node scripts/stock-eval.js <SYMBOL>');
  process.exit(1);
}

console.log(`Fetching data for ${symbol}...`);

const [quote, summary, history] = await Promise.all([
  getQuote(symbol),
  getSummary(symbol),
  getHistory(symbol),
]);

const fund = fundamentals(summary, quote);
const tech = technicals(history);
printReport(fund, tech);
