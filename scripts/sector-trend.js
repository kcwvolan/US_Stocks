/** 類股趨勢觀察（命令列）：node scripts/sector-trend.js */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readLog, sectorStats } from '../src/sectors.js';

const file = join(dirname(fileURLToPath(import.meta.url)), '../data/mover-log.jsonl');
const log = readLog(file);
if (!log.length) { console.log('尚無紀錄（data/mover-log.jsonl）。18:00 市場雷達推播後會開始累積。'); process.exit(0); }
const f = v => (v == null ? ' —' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
for (const w of sectorStats(log)) {
  console.log(`\n── 近 ${w.window} 個交易日${w.full ? '' : `（目前只累積 ${w.days} 日）`} ──`);
  console.log('類股'.padEnd(10) + '漲榜  跌榜  淨值  量榜  平均漲跌');
  for (const r of w.rows) console.log(r.sector.padEnd(10 - Math.max(0, [...r.sector].length - 4)) + `${String(r.up).padStart(4)}  ${String(r.down).padStart(4)}  ${String(r.net).padStart(4)}  ${String(r.active).padStart(4)}  ${f(r.avgChg).padStart(8)}`);
}
console.log('\n※ 以漲幅榜／跌幅榜／成交量榜上榜次數統計，不是法人買賣超；歷史無法回補，資料從開始記錄日起累積。');
