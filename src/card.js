/**
 * 個股視覺卡片：HTML → PNG（puppeteer-core + 本機 Chrome），以附件傳到 Discord。
 * 全部在本機完成，不經第三方。任何失敗都回傳 null，由呼叫端退回文字 embed。
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { convictionParts } from './analyze.js';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/opt/pw-browsers/chromium',
].filter(Boolean);

let browserP = null;
function getBrowser() {
  if (!browserP) {
    const exe = CHROME_CANDIDATES.find(p => existsSync(p));
    if (!exe) return Promise.reject(new Error('找不到 Chrome，可用 CHROME_PATH 指定'));
    browserP = puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  }
  return browserP;
}
export async function closeBrowser() {
  if (!browserP) return;
  try { (await browserP).close(); } catch {}
  browserP = null;
}

const n  = v => (v != null && !Number.isNaN(+v) ? +v : null);
const f2 = v => (n(v) != null ? n(v).toFixed(2) : 'N/A');
const f1 = v => (n(v) != null ? n(v).toFixed(1) : 'N/A');
const sg = v => (+v >= 0 ? '+' : '');
const sn = v => `${+v > 0 ? '+' : ''}${+v}`;
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function fmtCap(v) {
  if (!v) return '';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return String(v);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function stampText(d = new Date()) {
  const fmt = tz => new Intl.DateTimeFormat('zh-TW', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  const abbr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
    .formatToParts(d).find(x => x.type === 'timeZoneName')?.value ?? 'ET';
  return `資料時間　台灣 ${fmt('Asia/Taipei')}（美東 ${fmt('America/New_York')} ${abbr}）`;
}

const nyMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' });
function fmtVol(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

function chartSvg(hist) {
  const all = (hist ?? []).filter(d => n(d.close) != null);
  if (all.length < 30) return '';
  const sma = k => all.map((_, i) => (i + 1 < k ? null : all.slice(i + 1 - k, i + 1).reduce((a, d) => a + d.close, 0) / k));
  const N = Math.min(120, all.length);
  const off = all.length - N;
  const rows = all.slice(off);
  const m20 = sma(20).slice(off);
  const m50 = sma(50).slice(off);

  const W = 780, PR = 62, PH = 190, GAP = 14, VH = 60, AX = 22;
  const pw = W - PR, H = PH + GAP + VH + AX;
  const vals = [...rows.map(d => d.close), ...m20, ...m50].filter(v => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1, pad = span * 0.06;
  const y = v => 4 + (PH - 8) * (1 - (v - (lo - pad)) / (span + 2 * pad));
  const x = i => ((i + 0.5) * pw) / N;
  const pts = arr => arr.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');

  const closes = rows.map(d => d.close);
  const col = closes.at(-1) >= closes[0] ? '#3DCC8A' : '#E8445A';
  const area = `${x(0).toFixed(1)},${PH} ${pts(closes)} ${x(N - 1).toFixed(1)},${PH}`;

  const vmax = Math.max(...rows.map(d => d.volume ?? 0)) || 1;
  const bw = Math.max(1.5, (pw / N) * 0.7);
  const vTop = PH + GAP;
  const bars = rows.map((d, i) => {
    const prev = i ? rows[i - 1].close : all[off - 1]?.close ?? d.close;
    const h = ((d.volume ?? 0) / vmax) * VH;
    return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(vTop + VH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${d.close >= prev ? '#3DCC8A' : '#E8445A'}" opacity="0.75"/>`;
  }).join('');

  const grid = [hi, (hi + lo) / 2, lo].map(v =>
    `<line x1="0" x2="${pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#2B3445" stroke-width="1"/>` +
    `<text x="${pw + 6}" y="${(y(v) + 4).toFixed(1)}" font-size="12" fill="#9AA6B8">${f2(v)}</text>`).join('');

  let prevM = nyMonth.format(rows[0].date);
  const ticks = rows.map((d, i) => {
    const m = nyMonth.format(d.date);
    if (m === prevM) return '';
    prevM = m;
    return `<text x="${x(i).toFixed(1)}" y="${H - 5}" font-size="12" fill="#9AA6B8" text-anchor="middle">${m}月</text>`;
  }).join('');

  const last = closes.at(-1);
  return `<div class="chart"><div class="ctitle">近 ${N} 個交易日　成交價與成交量（日線）</div>
<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">
${grid}
<polygon points="${area}" fill="${col}" opacity="0.12"/>
<polyline points="${pts(m50)}" fill="none" stroke="#6FA0FF" stroke-width="1.5"/>
<polyline points="${pts(m20)}" fill="none" stroke="#C8A96E" stroke-width="1.5"/>
<polyline points="${pts(closes)}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
<circle cx="${x(N - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" fill="${col}"/>
<rect x="${pw + 2}" y="${(y(last) - 9).toFixed(1)}" width="${PR - 2}" height="18" rx="4" fill="${col}"/>
<text x="${pw + 6}" y="${(y(last) + 4).toFixed(1)}" font-size="12" font-weight="700" fill="#0F1A2B">${f2(last)}</text>
<text x="8" y="16" font-size="13" fill="${col}">━ 收盤價</text>
<text x="86" y="16" font-size="13" fill="#C8A96E">━ 20日均線</text>
<text x="176" y="16" font-size="13" fill="#6FA0FF">━ 50日均線</text>
${bars}
<text x="${pw + 6}" y="${vTop + 12}" font-size="12" fill="#9AA6B8">${fmtVol(vmax)}</text>
<text x="${pw + 6}" y="${vTop + VH}" font-size="12" fill="#9AA6B8">成交量</text>
${ticks}
</svg></div>`;
}

function rating(score) {
  if (score >= 6)  return ['強力買入', '#3DCC8A'];
  if (score >= 3)  return ['買入', '#7EC8E3'];
  if (score >= 0)  return ['持有', '#C8A96E'];
  if (score >= -3) return ['賣出', '#F39C12'];
  return ['強力賣出', '#E8445A'];
}

function bar(pct, color) {
  return `<div class="track"><div class="fill" style="width:${clamp(pct, 0, 100)}%;background:${color}"></div></div>`;
}

// 進場區間下限若高於現價，明確標示「高於現價」，避免被誤讀成可立即進場
function entryNote(entry, price) {
  const m = String(entry ?? '').match(/\$?([\d.]+)/);
  const lo = m ? +m[1] : null;
  if (lo == null || !price) return '';
  const d = (lo / price - 1) * 100;
  return d > 3 ? `<span class="warn">高於現價 ${f1(d)}%，需先反彈</span>` : '';
}

export function buildCardHtml({ sym, fund, ta, val, sigs, conviction, opts, hist }) {
  const price = n(fund?.price);
  const chg = n(fund?.change1d) ?? 0;
  const [rText, rColor] = rating(conviction ?? 0);
  const chgColor = chg >= 0 ? '#3DCC8A' : '#E8445A';
  const rsi = n(ta?.rsi14);
  const rsiColor = rsi == null ? '#5B6B7C' : rsi >= 70 ? '#E8445A' : rsi <= 30 ? '#7EC8E3' : '#C8A96E';
  const fromHigh = n(ta?.fromHigh);                 // 例如 -54.46
  const upside = n(val?.upside);
  const bulls = (sigs?.signals ?? []).filter(s => s.verdict === 'bullish').slice(0, 5);
  const bears = (sigs?.signals ?? []).filter(s => s.verdict === 'bearish').slice(0, 5);
  const li = (a, c) => a.length ? a.map(s => `<li style="color:${c}">${esc(s.label)}</li>`).join('') : '<li class="dim">無</li>';
  const earn = opts?.daysToEarnings != null && opts.daysToEarnings >= 0 && opts.daysToEarnings <= 35
    ? `<span class="chip">財報倒數 ${opts.daysToEarnings} 天</span>` : '';
  const p = ta?.pivots;
  const cp = convictionParts(sigs, ta, val, opts);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:900px;background:#141B27;color:#E6EAF0;font-family:'PingFang TC','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif;padding:0}
.card{padding:36px 40px 32px;border-top:8px solid ${rColor}}
.head{display:flex;justify-content:space-between;align-items:flex-start}
.sym{font-size:56px;font-weight:800;letter-spacing:1px}
.name{font-size:20px;color:#9AA6B8;margin-top:2px}
.badge{display:inline-block;padding:6px 18px;border-radius:999px;background:${rColor};color:#0F1A2B;font-weight:800;font-size:22px}
.price{font-size:54px;font-weight:800;margin-top:14px}
.chg{font-size:34px;font-weight:700;color:${chgColor};margin-left:14px}
.sub{font-size:18px;color:#9AA6B8;margin-top:6px}
.chip{display:inline-block;margin-left:10px;padding:3px 12px;border-radius:999px;background:#3A2E14;color:#F5C26B;font-size:16px;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 36px;margin-top:26px}
.lab{display:flex;justify-content:space-between;font-size:18px;color:#9AA6B8}
.lab b{color:#E6EAF0;font-size:22px}
.track{height:12px;border-radius:6px;background:#2B3445;margin-top:8px;overflow:hidden}
.fill{height:100%;border-radius:6px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
.box{background:#1B2434;border-radius:14px;padding:16px 20px}
.box h4{font-size:17px;margin-bottom:8px}
ul{list-style:none;padding:0}li{font-size:17px;line-height:1.55}.dim{color:#5B6B7C}
.lv{margin-top:24px;background:#1B2434;border-radius:14px;padding:16px 20px;font-size:18px;line-height:1.7}
.lv b{color:#fff}.warn{display:inline-block;margin-left:8px;padding:2px 10px;border-radius:999px;background:#3A1B22;color:#FF8A9B;font-size:15px;font-weight:700}
.stamp{margin-top:10px;font-size:17px;font-weight:700;color:#7EC8E3}
.chart{margin-top:24px;background:#1B2434;border-radius:14px;padding:14px 20px 8px}
.ctitle{font-size:17px;color:#9AA6B8;margin-bottom:4px}
.parts{font-size:14px;color:#9AA6B8;margin-top:4px}
.src{margin-top:4px;font-size:15px;color:#9AA6B8}
.foot{margin-top:18px;font-size:14px;color:#5B6B7C}
</style></head><body><div class="card">
<div class="head"><div><div class="sym">${esc(sym)}</div><div class="name">${esc(fund?.name ?? '')}</div></div>
<div style="text-align:right"><span class="badge">${rText}</span><div class="sub">Conviction ${conviction ?? 'N/A'}</div>
<div class="parts">訊號 ${sn(cp.signals)}　技術 ${sn(cp.tech)}　估值 ${sn(cp.valuation)}　選擇權 ${sn(cp.options)}</div></div></div>
<div class="price">$${f2(price)}<span class="chg">${chg >= 0 ? '▲' : '▼'} ${sg(chg)}${f2(chg)}%</span></div>
<div class="sub">市值 ${esc(fund?.marketCapText ?? fmtCap(fund?.marketCap))}${earn}</div>
<div class="stamp">${esc(stampText())}</div>
<div class="src">資料來源　Yahoo Finance（報價、財務、歷史股價、選擇權）；技術指標與訊號為本機依其資料計算</div>
<div class="grid">
<div><div class="lab"><span>RSI 14</span><b style="color:${rsiColor}">${f1(rsi)}${rsi != null ? (rsi >= 70 ? '　超買' : rsi <= 30 ? '　超賣' : '') : ''}</b></div>${bar(rsi ?? 0, rsiColor)}</div>
<div><div class="lab"><span>距 52 週高點</span><b>${fromHigh != null ? f1(fromHigh) + '%' : 'N/A'}</b></div>${bar(fromHigh != null ? 100 + fromHigh : 0, '#6FA0FF')}</div>
<div><div class="lab"><span>目標價 $${f2(val?.targetPrice)}</span><b style="color:${(upside ?? 0) >= 0 ? '#3DCC8A' : '#E8445A'}">${upside != null ? sg(upside) + f1(upside) + '%' : 'N/A'}</b></div>${bar(upside != null ? Math.abs(upside) / 1.5 : 0, (upside ?? 0) >= 0 ? '#3DCC8A' : '#E8445A')}</div>
<div><div class="lab"><span>IV</span><b>${opts?.iv1 != null ? (opts.iv1 * 100).toFixed(1) + '%' : 'N/A'}</b></div>${bar(opts?.iv1 != null ? opts.iv1 * 100 : 0, '#C8A96E')}</div>
</div>
${chartSvg(hist)}
<div class="cols"><div class="box"><h4 style="color:#3DCC8A">利多訊號</h4><ul>${li(bulls, '#BFEBD3')}</ul></div>
<div class="box"><h4 style="color:#E8445A">利空訊號</h4><ul>${li(bears, '#F5C0C8')}</ul></div></div>
<div class="lv"><div>進場 <b>${esc(ta?.entry ?? 'N/A')}</b>${entryNote(ta?.entry, price)}</div>
<div>停損 <b>${esc(ta?.stop ?? 'N/A')}</b></div>
${p ? `<div>支撐 <b>$${f2(p.s1)}</b> / <b>$${f2(p.s2)}</b>　壓力 <b>$${f2(p.r1)}</b> / <b>$${f2(p.r2)}</b></div>` : ''}</div>
<div class="foot">評級為規則計分，非人工判斷：≥6 強力買入／≥3 買入／≥0 持有／≥−3 賣出／其餘強力賣出。僅供參考，非投資建議</div>
</div></body></html>`;
}

export async function renderStockCard(stock) {
  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
    await page.setContent(buildCardHtml(stock), { waitUntil: 'load' });
    return Buffer.from(await page.screenshot({ type: 'png', fullPage: true }));
  } catch (e) {
    process.stderr.write(`卡片渲染失敗(${stock?.sym}): ${e.message}\n`);
    return null;
  } finally {
    try { await page?.close(); } catch {}
  }
}

// 以附件上傳；失敗會 throw（讓呼叫端決定是否退回文字 embed）
export async function postImage(webhook, buf, filename, embed = {}) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    embeds: [{ ...embed, image: { url: `attachment://${filename}` } }],
  }));
  form.append('files[0]', new Blob([buf], { type: 'image/png' }), filename);
  const res = await fetch(webhook, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  await new Promise(r => setTimeout(r, 1200));
}
