import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundamentals, technicals } from '../src/analyze.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSummary({ pe, fwdPe, eps, pb, roe, revGrowth, grossMargin, opMargin, de, cr, targetPrice, rec } = {}) {
  const wrap = v => (v != null ? { raw: v, fmt: String(v) } : null);
  return {
    summaryDetail:        { trailingPE: wrap(pe ?? 25), forwardPE: wrap(fwdPe ?? 20) },
    defaultKeyStatistics: { trailingEps: wrap(eps ?? 5), priceToBook: wrap(pb ?? 3), sharesOutstanding: wrap(1e9) },
    financialData: {
      returnOnEquity:    wrap(roe ?? 0.20),
      revenueGrowth:     wrap(revGrowth ?? 0.10),
      grossMargins:      wrap(grossMargin ?? 0.45),
      operatingMargins:  wrap(opMargin ?? 0.20),
      debtToEquity:      wrap(de ?? 50),
      currentRatio:      wrap(cr ?? 1.5),
      targetMeanPrice:   wrap(targetPrice ?? 150),
      recommendationKey: rec ?? 'buy',
    },
  };
}

function makeQuote({ price, prev, cap } = {}) {
  const p = price ?? 125;
  const pv = prev ?? 120;
  return {
    symbol: 'TEST',
    longName: 'Test Corp',
    regularMarketPrice: p,
    previousClose: pv,
    regularMarketChangePercent: ((p - pv) / pv) * 100,
    marketCap: cap ?? null,
  };
}

function makeHistory(closes) {
  return closes.map((close, i) => ({ date: new Date(2025, 0, i + 1), close }));
}

// ── fundamentals() ────────────────────────────────────────────────────────────

test('fundamentals: basic fields present', () => {
  const f = fundamentals(makeSummary(), makeQuote());
  assert.equal(f.symbol, 'TEST');
  assert.equal(f.name, 'Test Corp');
  assert.equal(f.price, 125);
  assert.equal(f.recommendation, 'buy');
});

test('fundamentals: change1d computed correctly', () => {
  const f = fundamentals(makeSummary(), makeQuote({ price: 110, prev: 100 }));
  assert.equal(f.change1d, '10.00');
});

test('fundamentals: P/E formatted to 2dp', () => {
  const f = fundamentals(makeSummary({ pe: 33.3333 }), makeQuote());
  assert.equal(f.pe, '33.33');
});

test('fundamentals: ROE converted to percent', () => {
  const f = fundamentals(makeSummary({ roe: 0.4849 }), makeQuote());
  assert.equal(f.roe, '48.49%');
});

test('fundamentals: missing fields return N/A', () => {
  const summary = {
    summaryDetail: {},
    defaultKeyStatistics: {},
    financialData: {},
  };
  const f = fundamentals(summary, makeQuote());
  assert.equal(f.pe, 'N/A');
  assert.equal(f.roe, 'N/A');
  assert.equal(f.targetPrice, 'N/A');
});

test('fundamentals: marketCap derived from sharesOutstanding when not in quote', () => {
  const f = fundamentals(makeSummary(), makeQuote({ cap: null }));
  // sharesOutstanding = 1e9, price = 125 → cap = 125B
  assert.ok(f.marketCap.includes('B'), `expected B suffix, got: ${f.marketCap}`);
});

test('fundamentals: marketCap uses quote.marketCap when provided', () => {
  const f = fundamentals(makeSummary(), makeQuote({ cap: 3e12 }));
  assert.equal(f.marketCap, '3.00T');
});

// ── technicals() ──────────────────────────────────────────────────────────────

test('technicals: returns null for empty history', () => {
  assert.equal(technicals([]), null);
});

test('technicals: SMA20 is average of last 20 closes', () => {
  const closes = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
  const t = technicals(makeHistory(closes));
  // last 20: 11..30, avg = (11+30)/2 = 20.5
  assert.equal(t.sma20, '20.50');
});

test('technicals: SMA200 is null-safe when fewer than 200 bars', () => {
  const closes = Array.from({ length: 100 }, () => 50);
  const t = technicals(makeHistory(closes));
  assert.equal(t.sma200, null);
});

test('technicals: 52w high/low correct', () => {
  const closes = [10, 200, 50, 80, 5, 120];
  const t = technicals(makeHistory(closes));
  assert.equal(t.high52w, '200.00');
  assert.equal(t.low52w, '5.00');
});

test('technicals: fromHigh52w is negative when below high', () => {
  const closes = Array.from({ length: 20 }, () => 100);
  const history = makeHistory([...closes.slice(0, -1), 80]); // last bar = 80
  const t = technicals(history);
  assert.ok(parseFloat(t.fromHigh52w) < 0, `expected negative, got ${t.fromHigh52w}`);
});

test('technicals: RSI is null when fewer than 15 bars', () => {
  const closes = Array.from({ length: 14 }, () => 50);
  const t = technicals(makeHistory(closes));
  assert.equal(t.rsi14, null);
});

test('technicals: RSI = 100 when all changes are gains', () => {
  const closes = Array.from({ length: 20 }, (_, i) => i + 1); // strictly increasing
  const t = technicals(makeHistory(closes));
  assert.equal(parseFloat(t.rsi14), 100);
});
