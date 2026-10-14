/**
 * KCW Watchlist Dashboard — 16 支每日深度分析
 * 格式：Rich Embed 卡片式 dashboard，inline fields 三欄 grid
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getQuote, getSummary, getHistory, getHistoryFull,
  getOptionsWithDteFloor, getCalendar,
} from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, convictionParts } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';

const __dir     = dirname(fileURLToPath(import.meta.url));
const WATCHLIST = JSON.parse(readFileSync(join(__dir, '../watchlist.json'), 'utf8')).tickers;
import { getWebhook } from '../src/webhook.js';
import { changeChartUrl } from '../src/chart.js';
import { renderStockCard, postImage, closeBrowser } from '../src/card.js';
const WEBHOOK   = getWebhook();
const BATCH     = 4;

// ── Discord ───────────────────────────────────────────────────
async function post(payload) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  await new Promise(r => setTimeout(r, 1200));
}
async function sendEmbed(embed)         { await post({ embeds: [embed] }); }
async function sendEmbeds(embeds)       { await post({ embeds }); }        // 最多 10 個/次
async function sendContent(text) {
  const chunks = splitMsg(text, 1990);
  for (const c of chunks) await post({ content: c });
}

function splitMsg(text, limit = 1990) {
  const lines = text.split('\n');
  const out = [];
  let cur = '';
  for (const l of lines) {
    if ((cur + '\n' + l).length > limit) { if (cur) out.push(cur.trim()); cur = l; }
    else cur = cur ? cur + '\n' + l : l;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ── 工具 ──────────────────────────────────────────────────────
const f2  = v => v != null ? (+v).toFixed(2) : 'N/A';
const f1  = v => v != null ? (+v).toFixed(1) : 'N/A';
const sgn = v => +v >= 0 ? '+' : '';
const pct = v => v != null ? `${sgn(v)}${f2(v)}%` : 'N/A';
const $ = v => v != null ? `＄${f2(v)}` : 'N/A';

function fmtCap(v) {
  if (!v) return 'N/A';
  if (v >= 1e12) return `${(v/1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `${(v/1e6).toFixed(1)}M`;
  return String(v);
}

function convictionColor(score) {
  if (score >= 6)  return 0x00C851; // 強綠
  if (score >= 3)  return 0x007E33; // 深綠
  if (score >= 0)  return 0xFFBB33; // 黃
  if (score >= -3) return 0xFF8800; // 橘
  return 0xCC0000;                  // 紅
}

function convictionLabel(score) {
  if (score >= 6)  return '🟢 強力買入';
  if (score >= 3)  return '🔵 買  入';
  if (score >= 0)  return '🟡 持  有';
  if (score >= -3) return '🟠 賣  出';
  return '🔴 強力賣出';
}

function chgEmoji(pct) {
  if (pct >=  5) return '🚀';
  if (pct >=  2) return '📈';
  if (pct >=  0) return '🟢';
  if (pct >= -2) return '🔴';
  if (pct >= -5) return '📉';
  return '💥';
}

function volLabel(r) {
  if (!r || r < 0)  return '—';
  if (r >= 5)  return `🔥🔥 ${f1(r)}x 爆量`;
  if (r >= 3)  return `🔥 ${f1(r)}x 放量`;
  if (r >= 2)  return `⚡ ${f1(r)}x 異常`;
  if (r >= 1.3)return `📊 ${f1(r)}x 偏高`;
  return `· ${f1(r)}x 正常`;
}

function trendLabel(ta) {
  if (!ta) return 'N/A';
  if (ta.trendBull) return '📈 多頭';
  if (ta.trendBear) return '📉 空頭';
  return '↔️ 震盪';
}

function rsiLabel(v) {
  if (v == null) return 'N/A';
  const n = +v;
  if (n >= 70) return `${f1(n)} ⚠️ 超買`;
  if (n <= 30) return `${f1(n)} ⚡ 超賣`;
  return `${f1(n)} 中性`;
}

function scoreConviction(sigs, ta, val, opts) {
  return convictionParts(sigs, ta, val, opts).total;
}

// ── 深度分析 ──────────────────────────────────────────────────
async function deepAnalyze(sym) {
  const [quote, summary, history, histFull, optData, calendar] = await Promise.all([
    getQuote(sym),
    getSummary(sym),
    getHistory(sym),
    getHistoryFull(sym),
    getOptionsWithDteFloor(sym, 7).catch(() => null),
    getCalendar(sym).catch(() => null),
  ]);
  const fund = fundamentals(summary, quote);
  const tech = technicals(history);
  const ta   = computeTechnicals(quote, histFull);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const opts = optData ? computeOptions(quote, optData, calendar) : null;
  const conviction = scoreConviction(sigs, ta, val, opts);
  return { sym, fund, tech, ta, val, sigs, opts, conviction, hist: histFull };
}

async function batchDeep(syms) {
  const results = [];
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    process.stdout.write(`  批次 ${Math.floor(i/BATCH)+1}：${batch.join(', ')}\n`);
    const settled = await Promise.allSettled(batch.map(deepAnalyze));
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
      else process.stderr.write(`  ⚠️ ${r.reason?.message ?? r.reason}\n`);
    }
    if (i + BATCH < syms.length) await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

// ── 單支股票 Embed 卡片 ───────────────────────────────────────
function buildStockEmbed({ sym, fund, tech, ta, val, sigs, opts, conviction }) {
  const chg    = fund.change1d ?? 0;
  const volR   = ta?.volRatio;
  const bullish = (sigs?.signals ?? []).filter(s => s.verdict === 'bullish').map(s => `+ ${s.label}`);
  const bearish = (sigs?.signals ?? []).filter(s => s.verdict === 'bearish').map(s => `- ${s.label}`);
  const neutral = (sigs?.signals ?? []).filter(s => s.verdict === 'neutral').map(s => `  ${s.label}`);
  const sigBlock = [...bullish, ...bearish, ...neutral].join('\n') || '  無訊號';

  const macdStr = ta?.macdHist != null
    ? `${ta.macdHist >= 0 ? '翻多' : '翻空'} ${sgn(ta.macdHist)}${f2(ta.macdHist)}`
    : 'N/A';

  const bbPct = ta?.bb
    ? `${((ta.price - ta.bb.lower) / (ta.bb.upper - ta.bb.lower) * 100).toFixed(0)}%`
    : 'N/A';

  const embed = {
    color: convictionColor(conviction),
    author: {
      name: `${sym}  ·  ${fund.name ?? sym}`,
    },
    title: `＄${f2(fund.price)}  ${chg >= 0 ? '▲' : '▼'} ${pct(chg)}`,
    description: `**${convictionLabel(conviction)}**　Conviction **${conviction}**　市值 ${fmtCap(fund.marketCap)}\n\`\`\`diff\n${sigBlock}\n\`\`\``,
    fields: [],
    footer: { text: '資料來源：Yahoo Finance　|　僅供參考，非投資建議' },
    timestamp: new Date().toISOString(),
  };

  // ── 欄 1：技術面 ────────────────────────────────────────────
  embed.fields.push({
    name: '📈 技術面',
    value: [
      `趨勢　　${trendLabel(ta)}`,
      `RSI 14　${rsiLabel(ta?.rsi14)}`,
      `MACD　 ${macdStr}`,
      `SMA20　${$(ta?.sma20)}`,
      `SMA50　${$(ta?.sma50)}`,
      `布林%B　${bbPct}`,
      `量比　　${volLabel(volR)}`,
    ].join('\n'),
    inline: true,
  });

  // ── 欄 2：基本面 ────────────────────────────────────────────
  embed.fields.push({
    name: '📊 基本面',
    value: [
      `P/E　　 ${fund.pe ?? 'N/A'}`,
      `Fwd P/E  ${fund.forwardPE ?? 'N/A'}`,
      `EPS　　 ＄${fund.eps ?? 'N/A'}`,
      `毛利率　${fund.grossMargin ?? 'N/A'}`,
      `營收成長 ${fund.revenueGrowth ?? 'N/A'}`,
      `ROE　　 ${fund.roe ?? 'N/A'}`,
      `評級　　${(fund.recommendation ?? 'N/A').toUpperCase().replace('_', ' ')}`,
    ].join('\n'),
    inline: true,
  });

  // ── 欄 3：估值 / 選擇權 ─────────────────────────────────────
  const col3 = [];
  if (val?.targetPrice) {
    col3.push(`目標價　${$(val.targetPrice)}`);
    col3.push(`潛在空間 ${pct(val.upside)}`);
  }
  if (val?.peScenarios) {
    col3.push(`熊市估值 ${$(val.peScenarios.bear)}`);
    col3.push(`牛市估值 ${$(val.peScenarios.bull)}`);
  }
  if (opts) {
    col3.push(`IV　　　${opts.iv1 != null ? `${(opts.iv1*100).toFixed(1)}%` : 'N/A'}`);
    col3.push(`PCR　　 ${f2(opts.pcr)} ${opts.pcr < 0.7 ? '看漲' : opts.pcr > 1.3 ? '看跌' : '中性'}`);
    if (opts.daysToEarnings != null && opts.daysToEarnings >= 0 && opts.daysToEarnings <= 35) {
      col3.push(`⚠️ 財報　倒數 ${opts.daysToEarnings}天`);
    }
    if (opts.strategy?.name) col3.push(`策略　　${opts.strategy.name}`);
  }
  if (col3.length) {
    embed.fields.push({ name: '💰 估值 & 選擇權', value: col3.join('\n'), inline: true });
  }

  // ── 支撐壓力（整行） ─────────────────────────────────────────
  if (ta?.pivots) {
    embed.fields.push({
      name: '🎯 進出場',
      value: `進場 **${ta.entry}**　停損 **${ta.stop}**　S1 ${$(ta.pivots.s1)}  S2 ${$(ta.pivots.s2)}　R1 ${$(ta.pivots.r1)}  R2 ${$(ta.pivots.r2)}`,
      inline: false,
    });
  }

  return embed;
}

// ══════════════════════════════════════════════════════════════
// 主程式
// ══════════════════════════════════════════════════════════════
const nowStr = new Date().toLocaleString('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric', month: 'long', day: 'numeric',
  weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
});

process.stdout.write(`📋 KCW Watchlist：${WATCHLIST.join(', ')}\n`);
process.stdout.write('📡 抓取即時報價...\n');

// ── Step 1：全部 16 支 quote ──────────────────────────────────
const quoteResults = await Promise.allSettled(WATCHLIST.map(getQuote));
const quotes = quoteResults.map((r, i) => ({
  sym: WATCHLIST[i],
  ok:  r.status === 'fulfilled',
  q:   r.status === 'fulfilled' ? r.value : null,
}));

// ── Step 2：封面 — Dashboard Header ──────────────────────────
const sorted  = quotes.filter(x => x.ok && x.q)
  .sort((a, b) => (b.q.regularMarketChangePercent ?? 0) - (a.q.regularMarketChangePercent ?? 0));

const gainers = sorted.slice(0, 5)
  .map(({ sym, q }) => `${chgEmoji(q.regularMarketChangePercent)} **${sym}** \`${sgn(q.regularMarketChangePercent)}${f2(q.regularMarketChangePercent)}%\` ＄${f2(q.regularMarketPrice)}`)
  .join('\n');
const losers  = sorted.slice(-5).reverse()
  .map(({ sym, q }) => `${chgEmoji(q.regularMarketChangePercent)} **${sym}** \`${sgn(q.regularMarketChangePercent)}${f2(q.regularMarketChangePercent)}%\` ＄${f2(q.regularMarketPrice)}`)
  .join('\n');

// 漲跌幅總覽表（ASCII，固定寬度）
const tableHeader = `${'TICKER'.padEnd(7)} ${'PRICE'.padStart(8)}  ${'CHG%'.padStart(7)}  ${'VOL RATIO'.padStart(9)}`;
const tableSep    = '─'.repeat(38);
const tableRows   = quotes.map(({ sym, ok, q }) => {
  if (!ok || !q) return `${sym.padEnd(7)} ${'─ 資料異常 ─'.padStart(28)}`;
  const chg  = q.regularMarketChangePercent ?? 0;
  const volR = q.averageVolume > 0 ? q.regularMarketVolume / q.averageVolume : null;
  return `${sym.padEnd(7)} ${f2(q.regularMarketPrice).padStart(8)}  ${(sgn(chg)+f2(chg)+'%').padStart(7)}  ${(volR ? f1(volR)+'x' : 'N/A').padStart(9)}`;
});

const chartUrl = await changeChartUrl(
  sorted.map(({ sym, q }) => ({ sym, chg: q.regularMarketChangePercent })),
  'Watchlist 今日漲跌幅 (%)',
);

await sendEmbed({
  color: 0x2B2D31,
  ...(chartUrl ? { image: { url: chartUrl } } : {}),
  title: '📋  KCW Watchlist Dashboard',
  description: `**${nowStr}**\n監控 **${WATCHLIST.length}** 支標的　｜　深度分析報告如下`,
  fields: [
    {
      name: '📊 漲跌幅全覽',
      value: `\`\`\`\n${tableHeader}\n${tableSep}\n${tableRows.join('\n')}\n\`\`\``,
      inline: false,
    },
    { name: '🏆 今日強勢',  value: gainers || '—', inline: true },
    { name: '📉 今日弱勢',  value: losers  || '—', inline: true },
  ],
  footer: { text: '資料來源：Yahoo Finance　|　僅供參考，非投資建議' },
  timestamp: new Date().toISOString(),
});

// ── Step 3：深度分析 + 推送 embed 卡片 ───────────────────────
process.stdout.write(`🔍 開始深度分析 ${WATCHLIST.length} 支...\n`);
const deepAll = await batchDeep(WATCHLIST);
deepAll.sort((a, b) => b.conviction - a.conviction);

// Discord 允許一次最多 10 個 embed；每支一個，兩兩一批避免超限
// 單日波動最大的 3 檔以圖片卡片呈現，其餘維持文字 embed；圖片失敗自動退回文字
// 預設全部出圖卡；若 watchlist.json 設了 cardTickers 陣列，則只有清單內的標的出圖卡，其餘用文字卡片
const pinned = JSON.parse(readFileSync(join(__dir, '../watchlist.json'), 'utf8')).cardTickers;
const highlightSyms = new Set(
  Array.isArray(pinned) && pinned.length
    ? pinned.map(t => String(t).toUpperCase())
    : deepAll.map(d => d.sym));
const textStocks = [];
for (const stock of deepAll) {
  let sent = false;
  if (highlightSyms.has(stock.sym)) {
    const buf = await renderStockCard(stock);
    if (buf) {
      try { await postImage(WEBHOOK, buf, `${stock.sym}.png`); sent = true; }
      catch (e) { process.stderr.write(`圖片上傳失敗(${stock.sym}): ${e.message}\n`); }
    }
  }
  if (!sent) textStocks.push(stock);
}
await closeBrowser();
for (let i = 0; i < textStocks.length; i += 2) {
  await sendEmbeds(textStocks.slice(i, i + 2).map(buildStockEmbed));
}

process.stdout.write(`\n✅ 完成 — 已推送 ${deepAll.length} 支 Watchlist Dashboard 至 Discord\n`);
