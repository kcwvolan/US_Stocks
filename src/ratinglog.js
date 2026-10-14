// Daily rating log + forward-return tracking.
// One JSON line per (date, symbol); re-running the same day replaces that day's line.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { ratingLabel, convictionParts } from './analyze.js';

export const HORIZONS = [1, 5, 20];

const day = d => new Date(d).toISOString().slice(0, 10);

export function makeEntry({ sym, fund, ta, val, sigs, opts, conviction, hist }) {
  const bar = hist?.at(-1);
  if (!bar || bar.close == null) return null;
  const parts = convictionParts(sigs, ta, val, opts);
  return {
    date: day(bar.date),            // trading date of the last bar the rating was based on
    sym,
    price: +bar.close,
    conviction,
    rating: ratingLabel(conviction),
    parts: { signals: parts.signals, tech: parts.tech, valuation: parts.valuation, options: parts.options },
    rsi14: ta?.rsi14 != null ? +ta.rsi14.toFixed(2) : null,
  };
}

export function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

export function mergeEntries(existing, incoming) {
  const map = new Map(existing.map(e => [`${e.date}|${e.sym}`, e]));
  for (const e of incoming) if (e) map.set(`${e.date}|${e.sym}`, e);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sym.localeCompare(b.sym));
}

export function appendRatings(file, incoming) {
  const merged = mergeEntries(readLog(file), incoming);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, merged.map(e => JSON.stringify(e)).join('\n') + '\n');
  return merged.length;
}

// Return after h trading bars, measured from the logged price. null if not enough bars yet.
export function forwardReturns(entry, hist, horizons = HORIZONS) {
  const i = hist.findIndex(b => day(b.date) === entry.date);
  const out = {};
  for (const h of horizons) {
    const b = i >= 0 ? hist[i + h] : null;
    out[h] = b?.close != null ? (b.close / entry.price - 1) * 100 : null;
  }
  return out;
}

// Average forward return per rating, for horizons that have data.
export function summarize(rows) {
  const by = new Map();
  for (const { entry, ret } of rows) {
    const g = by.get(entry.rating) ?? { rating: entry.rating, n: 0, byH: {} };
    g.n++;
    for (const h of HORIZONS) {
      if (ret[h] == null) continue;
      (g.byH[h] ??= []).push(ret[h]);
    }
    by.set(entry.rating, g);
  }
  return [...by.values()].map(g => ({
    rating: g.rating, n: g.n,
    horizons: Object.fromEntries(HORIZONS.map(h => {
      const v = g.byH[h] ?? [];
      return [h, { n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
                   win: v.length ? v.filter(x => x > 0).length / v.length * 100 : null }];
    })),
  }));
}
