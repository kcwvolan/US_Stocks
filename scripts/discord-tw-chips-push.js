/**
 * 臺股三大法人買賣超每日推播（證交所 T86／BFI82U）
 * 週一至週五執行；證交所約下午公布，尚未公布則每 5 分鐘重試，最多 3 次；休市日無資料則不推。
 */
import { fetchChips, topN, lots } from '../src/twchips.js';
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

const s = data.summary;
const footer = { text: '資料來源：臺灣證券交易所（三大法人買賣超日報）｜排名不含 ETF｜僅供參考，非投資建議' };
const embeds = [
  {
    color: 0x2B2D31,
    title: `🇹🇼 臺股三大法人買賣超　${dateText}`,
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
console.log(`✅ 已推送臺股三大法人買賣超（${dateText}，個股 ${data.rows.length} 檔）`);
