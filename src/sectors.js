// 類股趨勢觀察：每天把漲幅榜／跌幅榜／成交量榜依類股記錄下來，
// 再統計最近 10／30／60／120 個交易日（以紀錄裡不同的日期計）各類股上榜次數。
// 注意：榜單只能抓當下，無法回補歷史；紀錄從開始寫入那天才累積。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export const WINDOWS = [10, 30, 60, 120];
export const UNKNOWN = 'ETF／未分類';

const ZH = {
  Technology: '科技', Healthcare: '醫療保健', 'Financial Services': '金融', 'Consumer Cyclical': '非必需消費',
  'Consumer Defensive': '必需消費', Industrials: '工業', Energy: '能源', Utilities: '公用事業',
  'Real Estate': '不動產', 'Basic Materials': '原物料', 'Communication Services': '通訊服務',
};
export const sectorZh = s => (s ? (ZH[s] ?? s) : UNKNOWN);

// 美東交易日（epoch 秒 → YYYY-MM-DD）
export const etDate = sec =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(sec * 1000));

// ── JSONL 紀錄 ──────────────────────────────────────────────
export function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
}

export function mergeMovers(existing, incoming) {
  const map = new Map(existing.map(e => [`${e.date}|${e.list}|${e.sym}`, e]));
  for (const e of incoming) if (e?.date) map.set(`${e.date}|${e.list}|${e.sym}`, e);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.list.localeCompare(b.list) || a.sym.localeCompare(b.sym));
}

export function appendMovers(file, incoming) {
  const merged = mergeMovers(readLog(file), incoming);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, merged.map(e => JSON.stringify(e)).join('\n') + '\n');
  return merged.length;
}

// list: 'gainers' | 'losers' | 'actives'；沒有交易時間的項目略過
export function toEntries(list, quotes, sectorOf) {
  return quotes.filter(q => q.time && q.symbol).map(q => ({
    date: etDate(q.time), list, sym: q.symbol,
    sector: sectorOf(q.symbol), chg: q.changePct != null ? +(+q.changePct).toFixed(2) : null,
  }));
}

// ── 類股快取（類股幾乎不變，查過就不再查）────────────────────
export async function resolveSectors(syms, cacheFile, fetchProfile, { batch = 5, delayMs = 300 } = {}) {
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const todo = [...new Set(syms)].filter(s => !(s in cache));
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch);
    const res = await Promise.allSettled(part.map(fetchProfile));
    res.forEach((r, j) => {
      // 失敗（網路）不寫快取，下次再試；成功但沒有類股（ETF 等）寫 null
      if (r.status === 'fulfilled') cache[part[j]] = r.value?.sector ?? null;
    });
    if (delayMs && i + batch < todo.length) await new Promise(r => setTimeout(r, delayMs));
  }
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  return cache;
}

// ── 統計 ────────────────────────────────────────────────────
// 每個視窗：最近 N 個交易日；up＝漲幅榜上榜次數、down＝跌幅榜上榜次數、net＝up−down、
// active＝成交量榜次數、avgChg＝該類股所有上榜紀錄的平均漲跌幅
export function sectorStats(log, windows = WINDOWS) {
  const dates = [...new Set(log.map(e => e.date))].sort();
  return windows.map(n => {
    const use = new Set(dates.slice(-n));
    const by = new Map();
    for (const e of log) {
      if (!use.has(e.date)) continue;
      const name = sectorZh(e.sector);
      const g = by.get(name) ?? { sector: name, up: 0, down: 0, active: 0, chgSum: 0, chgN: 0 };
      if (e.list === 'gainers') g.up++; else if (e.list === 'losers') g.down++; else g.active++;
      if (e.chg != null) { g.chgSum += e.chg; g.chgN++; }
      by.set(name, g);
    }
    const rows = [...by.values()].map(g => ({
      sector: g.sector, up: g.up, down: g.down, active: g.active, net: g.up - g.down,
      avgChg: g.chgN ? g.chgSum / g.chgN : null,
    })).sort((a, b) => b.net - a.net || b.up - a.up || a.sector.localeCompare(b.sector));
    return { window: n, days: use.size, full: use.size >= n, rows };
  });
}

// ── Discord 呈現 ─────────────────────────────────────────────
const line = r => `${r.sector} ↑${r.up} ↓${r.down}（淨 ${r.net >= 0 ? '+' : ''}${r.net}）`;

export function sectorEmbed(stats) {
  const fields = stats.map(w => {
    const buy = w.rows.filter(r => r.net > 0).slice(0, 3);
    const sell = w.rows.filter(r => r.net < 0).slice(-3).reverse();
    const value = [
      ...buy.map(r => `🟢 ${line(r)}`),
      ...sell.map(r => `🔴 ${line(r)}`),
    ].join('\n') || '—';
    return { name: `近 ${w.window} 日${w.full ? '' : `（累積 ${w.days}/${w.window} 日）`}`, value, inline: true };
  });
  return {
    color: 0x6FA0FF,
    title: '🧭 美股類股趨勢觀察',
    description: '依每日漲幅榜／跌幅榜上榜次數統計（↑漲榜 ↓跌榜，淨＝↑−↓）。榜單無法回補歷史，資料從開始記錄日起累積，天數不足的視窗僅供參考。',
    fields,
    footer: { text: '資料來源：Yahoo Finance（榜單、類股）｜非法人買賣超，僅供參考，非投資建議' },
  };
}
