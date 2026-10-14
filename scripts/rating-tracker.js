/**
 * Forward-return report for the daily rating log (data/rating-log.jsonl).
 * Usage: node scripts/rating-tracker.js
 * Note: the sample is small and the horizons are short — read it as a sanity check, not proof.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getHistoryFull } from '../src/fetch.js';
import { readLog, forwardReturns, summarize, HORIZONS } from '../src/ratinglog.js';

const file = join(dirname(fileURLToPath(import.meta.url)), '../data/rating-log.jsonl');
const log = readLog(file);
if (!log.length) { console.log('尚無紀錄（data/rating-log.jsonl）。Watchlist 推播執行後會自動寫入。'); process.exit(0); }

const syms = [...new Set(log.map(e => e.sym))];
const hists = Object.fromEntries(await Promise.all(syms.map(async s => [s, await getHistoryFull(s).catch(() => [])])));
const rows = log.map(entry => ({ entry, ret: forwardReturns(entry, hists[entry.sym] ?? []) }));

const dates = [...new Set(log.map(e => e.date))];
console.log(`紀錄 ${log.length} 筆，${dates.length} 個交易日（${dates[0]} ~ ${dates.at(-1)}），${syms.length} 支\n`);
const order = ['強力買入', '買入', '持有', '賣出', '強力賣出'];
const f = (x, d = 2) => x == null ? '  —  ' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;
console.log('評級'.padEnd(8) + '筆數  ' + HORIZONS.map(h => `${h}日均報酬(勝率,n)`.padEnd(24)).join(''));
for (const g of summarize(rows).sort((a, b) => order.indexOf(a.rating) - order.indexOf(b.rating))) {
  console.log(g.rating.padEnd(8) + String(g.n).padEnd(6) + HORIZONS.map(h => {
    const x = g.horizons[h];
    return (x.n ? `${f(x.avg)} (${x.win.toFixed(0)}%, ${x.n})` : '資料未滿').padEnd(24);
  }).join(''));
}
console.log('\n※ 樣本少、期間短，只能當檢查用，不能當作評級有效的證據。');
