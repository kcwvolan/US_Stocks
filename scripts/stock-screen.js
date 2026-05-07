import { getQuote, getSummary } from '../src/fetch.js';
import chalk from 'chalk';
import Table from 'cli-table3';

const raw = v => (v != null && typeof v === 'object' && 'raw' in v ? v.raw : v);
const pct = v => { const n = raw(v); return n != null ? (n * 100).toFixed(1) + '%' : 'N/A'; };
const num = (v, d = 1) => { const n = raw(v); return n != null ? n.toFixed(d) : 'N/A'; };

const WATCHLIST = (process.argv.slice(2).length ? process.argv.slice(2) : [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V',
]).map(s => s.toUpperCase());

console.log(`Screening ${WATCHLIST.length} stocks...`);

const results = await Promise.allSettled(
  WATCHLIST.map(async sym => {
    const [quote, summary] = await Promise.all([getQuote(sym), getSummary(sym)]);
    const fd = summary.financialData ?? {};
    const sd = summary.summaryDetail ?? {};
    return {
      sym,
      price: quote.regularMarketPrice?.toFixed(2),
      change: quote.regularMarketChangePercent?.toFixed(2),
      pe: num(sd.trailingPE),
      roe: pct(fd.returnOnEquity),
      margin: pct(fd.grossMargins),
      rec: fd.recommendationKey ?? 'N/A',
    };
  })
);

const table = new Table({
  head: ['Symbol', 'Price', 'Day%', 'P/E', 'ROE', 'Gross Margin', 'Analyst'].map(h => chalk.yellow(h)),
});

for (const r of results) {
  if (r.status === 'fulfilled') {
    const d = r.value;
    const chg = parseFloat(d.change);
    table.push([
      chalk.bold(d.sym),
      `$${d.price}`,
      chg >= 0 ? chalk.green(`+${d.change}%`) : chalk.red(`${d.change}%`),
      d.pe,
      d.roe,
      d.margin,
      d.rec,
    ]);
  } else {
    table.push([chalk.gray(r.reason?.message?.split('\n')[0] ?? 'error'), '', '', '', '', '', '']);
  }
}

console.log(table.toString());
