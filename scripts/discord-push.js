/**
 * KCW 美股每日市場情報深度分析報告
 * 從 Yahoo Finance 全市場篩選：成交量異常、價格動能、盤前快訊
 * 使用專業 Discord Markdown 樣板推送
 */
import {
  getScreener, getPreMarket, getMarketNews,
  getQuote, getSummary, getHistory, getHistoryFull,
  getOptionsWithDteFloor, getCalendar,
} from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';

import { getWebhook } from '../src/webhook.js';
import { changeChartUrl } from '../src/chart.js';
import { renderStockCard, postImage, closeBrowser } from '../src/card.js';
const WEBHOOK           = getWebhook();
const TOP_N             = 8;
const DEEP_N            = 5;
const VOL_SPIKE_THRESH  = 2.0;

// ── Discord 工具 ─────────────────────────────────────────────
async function post(payload) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  await new Promise(r => setTimeout(r, 1200));
}

// 發送純 content（支援完整 Markdown 語法）
async function send(text) {
  const chunks = splitDiscord(text, 1990);
  for (const chunk of chunks) await post({ content: chunk });
}

// 發送 embed（封面用）
async function sendEmbed(embed) {
  await post({ embeds: [embed] });
}

// 分割長文（Discord 上限 2000 字）
function splitDiscord(text, limit = 1990) {
  const lines = text.split('\n');
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if ((cur + '\n' + line).length > limit) {
      if (cur) chunks.push(cur.trim());
      cur = line;
    } else {
      cur = cur ? cur + '\n' + line : line;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// ── 格式工具 ─────────────────────────────────────────────────
const f2   = v => v != null ? (+v).toFixed(2) : 'N/A';
const f1   = v => v != null ? (+v).toFixed(1) : 'N/A';
const sgn  = v => +v >= 0 ? '+' : '';
const pad  = (s, n) => String(s ?? 'N/A').padEnd(n);
const lpad = (s, n) => String(s ?? 'N/A').padStart(n);

function fmtCap(v) {
  if (!v) return 'N/A';
  if (v >= 1e12) return `${(v/1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `${(v/1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `${(v/1e6).toFixed(1)}M`;
  return String(v);
}

function ratingInfo(score) {
  if (score >= 6)  return { emoji: '🟢', text: '強力買入', color: 0x3DCC8A };
  if (score >= 3)  return { emoji: '🔵', text: '買  入',   color: 0x7EC8E3 };
  if (score >= 0)  return { emoji: '🟡', text: '持  有',   color: 0xC8A96E };
  if (score >= -3) return { emoji: '🟠', text: '賣  出',   color: 0xF39C12 };
  return             { emoji: '🔴', text: '強力賣出', color: 0xE8445A };
}

function volLabel(r) {
  if (!r) return '—';
  if (r >= 5)   return '🔥🔥 爆量';
  if (r >= 3)   return '🔥  放量';
  if (r >= 2)   return '⚡  異常';
  if (r >= 1.3) return '📊  偏高';
  return '·   正常';
}

function scoreConviction(sigs, ta, val, opts) {
  let s = sigs?.score ?? 0;
  if (ta?.rating === 'BULLISH') s += 2;
  else if (ta?.rating === 'BEARISH') s -= 2;
  if (val?.upside > 25) s += 1;
  else if (val?.upside < -10) s -= 1;
  if (opts?.pcr != null) {
    if (opts.pcr < 0.6) s += 0.5;
    else if (opts.pcr > 1.5) s -= 0.5;
  }
  return +s.toFixed(2);
}

// ══════════════════════════════════════════════════════════════
// 🎯 市場雷達掃描 Embed 樣板
// ══════════════════════════════════════════════════════════════
function radarColor(volR, chg) {
  const v = volR ?? 1;
  const c = Math.abs(chg ?? 0);
  if (v >= 5 || c >= 8)  return 0xFF4444; // 爆量 / 極端走勢 — 紅警戒
  if (v >= 3 || c >= 5)  return 0xFF8C00; // 放量 / 大波動 — 橘
  if (v >= 2 || c >= 3)  return 0xFFBB33; // 異常 / 中波動 — 琥珀
  if (v >= 1.3)          return 0xC8A96E; // 偏高量 — 金
  return 0x5B6B7C;                        // 正常 — 暗鋼藍
}

function radarVolBar(r) {
  if (!r) return '░░░░░░░░  N/A';
  const filled = Math.min(8, Math.round(r * 8 / 5));
  return '█'.repeat(filled) + '░'.repeat(8 - filled) + `  ${f1(r)}x`;
}

function signalMatrix(sigs) {
  const bulls = (sigs?.signals ?? []).filter(s => s.verdict === 'bullish');
  const bears = (sigs?.signals ?? []).filter(s => s.verdict === 'bearish');
  const top   = [...bulls.slice(0,2).map(s => `▲ ${s.label}`),
                  ...bears.slice(0,2).map(s => `▼ ${s.label}`)];
  return {
    score:   `${bulls.length > 0 ? `🟢 ${bulls.length}` : '—'}  /  ${bears.length > 0 ? `🔴 ${bears.length}` : '—'}`,
    preview: top.length ? top.join('\n') : '● 無顯著訊號',
  };
}

function buildRadarEmbed({ sym, fund, ta, val, sigs, opts, conviction, screenData }) {
  const volR  = screenData?.volRatio ?? ta?.volRatio;
  const chg   = fund.change1d ?? 0;
  const r     = ratingInfo(conviction);
  const mat   = signalMatrix(sigs);

  // ── 動能熱力值（0–10） ────────────────────────────────────
  const heatScore = Math.min(10,
    Math.abs(chg ?? 0) * 0.4 + (volR ?? 1) * 0.6
  ).toFixed(1);

  // ── 描述：觸發原因 ────────────────────────────────────────
  const trigger = screenData
    ? `量比 **${f1(volR)}x** · 今日 **${sgn(chg)}${f2(chg)}%** · 動能熱力 **${heatScore}/10**`
    : `今日 **${sgn(chg)}${f2(chg)}%** · 動能熱力 **${heatScore}/10**`;

  const profitLabel = parseFloat(fund.eps) > 0 ? '獲利' : '虧損';
  const upsideStr   = val?.upside != null ? `  目標 ＄${val.targetPrice}（${sgn(val.upside)}${f1(val.upside)}%）` : '';

  const embed = {
    color: radarColor(volR, chg),
    author: { name: `🎯 RADAR SCAN  ·  熱力 ${heatScore}/10  ·  ${r.emoji} ${r.text}` },
    title:  `${sym}  ·  ＄${f2(fund.price)}  ${+chg >= 0 ? '▲' : '▼'} ${sgn(chg)}${f2(chg)}%`,
    description: `**${fund.name ?? sym}**  ·  市值 ${fmtCap(fund.marketCap)}  ·  ${profitLabel}${upsideStr}\n${trigger}`,
    fields: [],
    footer: { text: '本報告僅供參考，非投資建議  |  資料來源：Yahoo Finance' },
    timestamp: new Date().toISOString(),
  };

  // ── 欄 1：量能雷達 ────────────────────────────────────────
  const macdStr = ta?.macdHist != null
    ? `${ta.macdHist >= 0 ? '翻多' : '翻空'} ${sgn(ta.macdHist)}${f2(ta.macdHist)}`
    : 'N/A';
  embed.fields.push({
    name: '⚡ 量能雷達',
    value: [
      `量  比  ${radarVolBar(volR)}`,
      `ATR(14) ＄${f2(ta?.atr14)}  波動 ${ta?.atr14 ? f1(ta.atr14/ta.price*100)+'%' : 'N/A'}`,
      `趨  勢  ${ta?.trendBull ? '📈 多頭' : ta?.trendBear ? '📉 空頭' : '↔️ 震盪'}`,
      `RSI 14  ${f1(ta?.rsi14)}  ${(ta?.rsi14 ?? 50) >= 70 ? '⚠️ 超買' : (ta?.rsi14 ?? 50) <= 30 ? '⚡ 超賣' : '中性'}`,
      `MACD    ${macdStr}`,
      `52W 高  距今 ${f1(ta?.fromHigh)}%`,
    ].join('\n'),
    inline: true,
  });

  // ── 欄 2：訊號矩陣 ────────────────────────────────────────
  embed.fields.push({
    name: `🔍 訊號矩陣  ${mat.score}`,
    value: [
      mat.preview,
      '',
      `評  級  ${(fund.recommendation ?? 'N/A').toUpperCase().replace('_', ' ')}`,
      `毛利率  ${fund.grossMargin ?? 'N/A'}`,
      `營收成長 ${fund.revenueGrowth ?? 'N/A'}`,
      `Conviction  **${conviction}**`,
    ].join('\n'),
    inline: true,
  });

  // ── 選擇權警示（整行，有資料才顯示） ─────────────────────
  if (opts) {
    const iv      = opts.iv1 != null ? `${(opts.iv1*100).toFixed(1)}%` : 'N/A';
    const strMove = opts.straddlePct ? `±${opts.straddlePct.toFixed(1)}%` : 'N/A';
    const pcrNote = opts.pcr < 0.7 ? '偏多' : opts.pcr > 1.3 ? '偏空' : '中性';
    const earningsAlert = opts.daysToEarnings != null && opts.daysToEarnings >= 0 && opts.daysToEarnings <= 35
      ? `  ⚠️ **財報倒數 ${opts.daysToEarnings} 天**` : '';
    embed.fields.push({
      name: `⚡ 選擇權  ${opts.expiry1}（${opts.dte1} DTE）${earningsAlert}`,
      value: `IV **${iv}** （${opts.ivEnv ?? 'N/A'}）  隱含波幅 **${strMove}**  PCR **${f2(opts.pcr)}** ${pcrNote}  最大痛點 ＄${opts.mp ?? 'N/A'}\n📌 策略：**${opts.strategy?.name ?? 'N/A'}** — ${opts.strategy?.legs ?? ''}`,
      inline: false,
    });
  }

  // ── 進出場 ─────────────────────────────────────────────────
  if (ta?.entry) {
    const pivStr = ta.pivots
      ? `  S1 ＄${f2(ta.pivots.s1)}  S2 ＄${f2(ta.pivots.s2)}  ·  R1 ＄${f2(ta.pivots.r1)}  R2 ＄${f2(ta.pivots.r2)}`
      : '';
    embed.fields.push({
      name: '🎯 進出場',
      value: `進場 **${ta.entry}**  ·  停損 **${ta.stop}**${pivStr}`,
      inline: false,
    });
  }

  return embed;
}

// ══════════════════════════════════════════════════════════════
// 深度分析
// ══════════════════════════════════════════════════════════════
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
  return { sym, fund, tech, ta, val, sigs, opts, conviction };
}

// ══════════════════════════════════════════════════════════════
// 主程式
// ══════════════════════════════════════════════════════════════
const nowStr = new Date().toLocaleString('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric', month: 'long', day: 'numeric',
  weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
});

process.stdout.write('📡 正在從 Yahoo Finance 抓取市場資料...\n');

const [gainers, losers, actives, news] = await Promise.all([
  getScreener('day_gainers', TOP_N),
  getScreener('day_losers',  TOP_N),
  getScreener('most_actives', TOP_N),
  getMarketNews(6).catch(() => []),
]);

// 合併去重 + 量比計算
const allMap = new Map();
for (const q of [...gainers, ...losers, ...actives]) {
  if (!allMap.has(q.symbol)) {
    allMap.set(q.symbol, {
      ...q,
      volRatio: q.avgVolume > 0 ? q.volume / q.avgVolume : null,
    });
  }
}
const candidates = [...allMap.values()];

// 動能評分排序
const scored = candidates
  .map(q => ({ ...q, momScore: Math.abs(q.changePct ?? 0) * 0.4 + ((q.volRatio ?? 1) * 0.6) }))
  .sort((a, b) => b.momScore - a.momScore);

const deepTargets = scored.slice(0, DEEP_N).map(q => q.symbol);
process.stdout.write(`🔍 深度分析：${deepTargets.join(', ')}\n`);

const deepResults = await Promise.allSettled(deepTargets.map(deepAnalyze));
const deep = deepResults
  .map((r, i) => r.status === 'fulfilled'
    ? { ...r.value, screenData: allMap.get(deepTargets[i]) }
    : null)
  .filter(Boolean)
  .sort((a, b) => b.conviction - a.conviction);

// ────────────────────────────────────────────────────────────
// 封面 Embed
// ────────────────────────────────────────────────────────────
const volSpikes = candidates.filter(q => (q.volRatio ?? 0) >= VOL_SPIKE_THRESH)
  .sort((a, b) => (b.volRatio ?? 0) - (a.volRatio ?? 0)).slice(0, 5);

const newsText = news.length
  ? news.map(n => `**[${n.pubDate}]** ${n.title} *— ${n.publisher}*`).join('\n')
  : '暫無新聞資料';

const chartUrl = await changeChartUrl(
  [...gainers.slice(0, 5), ...losers.slice(0, 5)].map(q => ({ sym: q.symbol, chg: q.changePct })),
  '今日漲跌幅 Top 5 / Bottom 5 (%)',
);

await sendEmbed({
  title: '📊 KCW 美股每日市場情報深度報告',
  description: `**${nowStr}**\n篩選範圍：漲幅榜 · 跌幅榜 · 成交量榜　｜　深度分析 **${deep.length}** 支高動能標的\n\n**📰 盤前快訊**\n${newsText}`,
  color: 0xC8A96E,
  ...(chartUrl ? { image: { url: chartUrl } } : {}),
  fields: [
    {
      name: '⚡ 成交量異常排行',
      value: volSpikes.length
        ? volSpikes.map(q => `${volLabel(q.volRatio)} **${q.symbol}** ${f2(q.volRatio)}x　${sgn(q.changePct)}${f2(q.changePct)}%`).join('\n')
        : '無顯著異常',
      inline: true,
    },
    {
      name: '🏆 今日漲幅榜 Top 5',
      value: gainers.slice(0,5).map(q => `🟢 **${q.symbol}** ${sgn(q.changePct)}${f2(q.changePct)}%　＄${f2(q.price)}`).join('\n'),
      inline: true,
    },
  ],
  footer: { text: '本報告僅供參考，不構成投資建議　|　資料來源：Yahoo Finance' },
});

// ────────────────────────────────────────────────────────────
// 深度個股報告（市場雷達 Embed 格式）
// ────────────────────────────────────────────────────────────
// 全部以圖片卡片呈現；圖片失敗自動退回文字 embed
const highlightSyms = new Set(deep.map(d => d.sym));
for (const stock of deep) {
  let sent = false;
  if (highlightSyms.has(stock.sym)) {
    const buf = await renderStockCard(stock);
    if (buf) {
      try { await postImage(WEBHOOK, buf, `${stock.sym}.png`); sent = true; }
      catch (e) { process.stderr.write(`圖片上傳失敗(${stock.sym}): ${e.message}\n`); }
    }
  }
  if (!sent) await sendEmbed(buildRadarEmbed(stock));
}
await closeBrowser();

process.stdout.write(`\n✅ 完成 — 已推送 ${deep.length} 支深度分析至 Discord\n`);
