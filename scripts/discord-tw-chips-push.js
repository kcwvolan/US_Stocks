/**
 * 臺股三大法人買賣超每日推播（證交所 T86／BFI82U）
 * 週一至週五執行；證交所約下午公布，尚未公布則每 5 分鐘重試，最多 3 次；休市日無資料則不推。
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchChips, topN, lots, pickWatch } from '../src/twchips.js';
import { deepAnalyze } from '../src/deep.js';
import { renderStockCard, postImage, closeBrowser } from '../src/card.js';
import { getWebhook } from '../src/webhook.js';

const WEBHOOK = getWebhook();
const tz = { timeZone: 'Asia/Taipei' };
const parts = new Intl.DateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
  .formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
if (['Sat', 'Sun'].includes(parts.weekday)) { console.log('週末休市，不推播'); process.exit(0); }
const ymd = `${parts.year}${parts.month}${parts.day}`;
const dateText = `${parts.year}/${parts.month}/${parts.day}`;

let data = null;
for (let i = 0; i < 4; i++) {
  try { const d = await fetchChips(ymd); if (d.summary && d.rows.length) { data = d; break; } }
  catch (e) { process.stderr.write(`抓取失敗: ${e.message}\n`); }
  if (i < 3) { console.log(`尚無 ${ymd} 資料，5 分鐘後重試（${i + 1}/3）`); await new Promise(r => setTimeout(r, 5 * 60 * 1000)); }
}
if (!data) { console.log(`無 ${ymd} 資料（休市或證交所尚未公布），不推播`); process.exit(0); }

const sg = v => (v >= 0 ? '+' : '');
const yi = v => `${sg(v)}${v.toFixed(1)}`;
const pad = (s, n) => s + '　'.repeat(Math.max(0, n - [...s].length));
const block = (rows, key, sign) => {
  if (!rows.length) return '—';
  return '```diff\n' + rows.map(r => `${sign} ${r.code} ${pad(r.name, 5)} ${lots(r[key]).toLocaleString('en-US')}`).join('\n') + '\n```';
};
const rankEmbed = (title, key, color) => {
  const { buy, sell } = topN(data.rows, key, 10);
  return {
    color, title,
    fields: [
      { name: '🟢 買超 Top 10（張）', value: block(buy, key, '+'), inline: true },
      { name: '🔴 賣超 Top 10（張）', value: block(sell, key, '-'), inline: true },
    ],
  };
};

// 自選股（tw-watchlist.json，本機檔、不進 Git）：每檔列外資／投信／自營商／合計（張）
const wlFile = join(dirname(fileURLToPath(import.meta.url)), '../tw-watchlist.json');
const watch = existsSync(wlFile) ? JSON.parse(readFileSync(wlFile, 'utf8')).tickers ?? [] : [];
const L = v => `${v >= 0 ? '+' : ''}${lots(v).toLocaleString('en-US')}`;
const watchEmbed = watch.length ? {
  color: 0xF39C12,
  title: '⭐ 自選股三大法人買賣超（張）',
  description: '```diff\n' + pickWatch(data.rows, watch).map(({ code, name, row }) =>
    row ? `${row.total >= 0 ? '+' : '-'} ${code} ${name}　外 ${L(row.foreign)}　投 ${L(row.trust)}　自 ${L(row.dealer)}　合 ${L(row.total)}`
        : `  ${code} ${name}　無資料`).join('\n') + '\n```',
} : null;

const s = data.summary;
const footer = { text: '資料來源：臺灣證券交易所、證券櫃檯買賣中心（三大法人買賣超）｜排名不含 ETF｜僅供參考，非投資建議' };
const embeds = [
  {
    color: 0x2B2D31,
    title: `🇹🇼 臺股三大法人買賣超　${dateText}`,
    footer: { text: '合計金額為上市；排名與自選股含上市＋上櫃' },
    description: '```diff\n' + [
      `${s.foreign >= 0 ? '+' : '-'} 外資　${yi(s.foreign)} 億元`,
      `${s.trust >= 0 ? '+' : '-'} 投信　${yi(s.trust)} 億元`,
      `${s.dealer >= 0 ? '+' : '-'} 自營商 ${yi(s.dealer)} 億元`,
      `${s.total >= 0 ? '+' : '-'} 合計　${yi(s.total)} 億元`,
    ].join('\n') + '\n```',
  },
  rankEmbed('三大法人合計', 'total', 0x6FA0FF),
  rankEmbed('外資', 'foreign', 0xC8A96E),
  { ...rankEmbed('投信', 'trust', 0x3DCC8A), footer, timestamp: new Date().toISOString() },
];

const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds }) });
if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
console.log(`✅ 已推送臺股三大法人買賣超（${dateText}，個股 ${data.rows.length} 檔（上市 ${data.listedCount}／上櫃 ${data.otcCount}））`);

// ── 自選股圖卡（與美股同款：價量線圖、技術指標、評級、新聞；另含三大法人）──────────
if (watch.length) {
  process.stdout.write(`🔍 自選股深度分析 ${watch.length} 檔...\n`);
  const picked = pickWatch(data.rows, watch);
  const results = [];
  for (let i = 0; i < watch.length; i += 4) {
    const part = watch.slice(i, i + 4);
    const settled = await Promise.allSettled(part.map(w => deepAnalyze(w.yahoo ?? w.code)));
    settled.forEach((r, j) => {
      const w = part[j];
      if (r.status !== 'fulfilled') { process.stderr.write(`  ⚠️ ${w.code} ${w.name}: ${r.reason?.message ?? r.reason}\n`); return; }
      const row = picked.find(x => x.code === w.code)?.row;
      results.push({
        ...r.value, sym: w.code, zhName: w.name, market: 'TW',
        chips: row ? { date: dateText, foreign: row.foreign, trust: row.trust, dealer: row.dealer, total: row.total } : null,
      });
    });
    if (i + 4 < watch.length) await new Promise(r => setTimeout(r, 2000));
  }
  const failedText = [];
  for (const stock of results) {
    let sent = false;
    const buf = await renderStockCard(stock);
    if (buf) {
      try { await postImage(WEBHOOK, buf, `${stock.sym}.png`); sent = true; }
      catch (e) { process.stderr.write(`圖片上傳失敗(${stock.sym}): ${e.message}\n`); }
    }
    if (!sent) failedText.push(stock.sym);
  }
  await closeBrowser();
  // 圖卡失敗的標的退回文字（只剩三大法人數字）
  if (failedText.length && watchEmbed) {
    await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [watchEmbed] }) });
  }
  console.log(`✅ 自選股圖卡 ${results.length - failedText.length}/${watch.length} 張`);
}
