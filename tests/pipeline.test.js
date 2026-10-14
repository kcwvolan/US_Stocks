import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';
import { buildMarkdownReport } from '../src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Synthetic fixtures ────────────────────────────────────────────────────────

const w = v => ({ raw: v, fmt: String(v) });

function makeSummary(overrides = {}) {
  return {
    summaryDetail:        { trailingPE: w(25), forwardPE: w(20) },
    defaultKeyStatistics: { trailingEps: w(4), priceToBook: w(3), sharesOutstanding: w(500e6) },
    financialData: {
      returnOnEquity:  w(0.20), revenueGrowth: w(0.15),
      grossMargins:    w(0.55), operatingMargins: w(0.25),
      debtToEquity:    w(30),   currentRatio: w(2.0),
      targetMeanPrice: w(120),  recommendationKey: 'buy',
    },
    incomeStatementHistory: {
      incomeStatementHistory: [
        { endDate: { raw: 1704067200, fmt: '2024-01-01' }, totalRevenue: w(100e9), grossProfit: w(55e9), netIncome: w(20e9) },
        { endDate: { raw: 1672531200, fmt: '2023-01-01' }, totalRevenue: w(87e9),  grossProfit: w(48e9), netIncome: w(17e9) },
      ],
    },
    ...overrides,
  };
}

function makeQuote(price = 100) {
  return {
    symbol: 'TEST', longName: 'Test Corp', shortName: 'TEST',
    regularMarketPrice: price, previousClose: price * 0.95,
    regularMarketChangePercent: 5.26,
    marketCap: 50e9, sharesOutstanding: 500e6,
  };
}

function makeHistoryFull(n = 252, basePrice = 80) {
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.now() - (n - i) * 86400000),
    open:   basePrice + i * 0.08 - 0.5,
    high:   basePrice + i * 0.08 + 1.5,
    low:    basePrice + i * 0.08 - 1.5,
    close:  basePrice + i * 0.08,
    volume: 1_000_000 + (i % 5) * 200_000,
  }));
}

function makeOptData(price = 100, dteDays = 14) {
  const expTs = Math.floor((Date.now() + dteDays * 86400000) / 1000);
  const strikes = [95, 97, 99, 100, 101, 103, 105];
  const calls = strikes.map(strike => ({
    strike,
    bid:   Math.max(0, price - strike + 1),
    ask:   Math.max(0.05, price - strike + 1.5),
    lastPrice: Math.max(0.01, price - strike + 0.8),
    openInterest: 500,
    impliedVolatility: 0.30,
  }));
  const puts = strikes.map(strike => ({
    strike,
    bid:   Math.max(0, strike - price + 1),
    ask:   Math.max(0.05, strike - price + 1.5),
    lastPrice: Math.max(0.01, strike - price + 0.8),
    openInterest: 400,
    impliedVolatility: 0.32,
  }));
  return { options: [{ expirationDate: expTs, calls, puts }], strikes, expirationDates: [expTs] };
}

// ── Watchlist structure ───────────────────────────────────────────────────────

test('watchlist.json: file exists', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'watchlist.json')), 'watchlist.json not found');
});

test('watchlist.json: valid JSON with tickers array', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'watchlist.json'), 'utf8');
  const parsed = JSON.parse(raw);
  assert.ok(Array.isArray(parsed.tickers), 'tickers must be an array');
  assert.ok(parsed.tickers.length > 0, 'tickers array must not be empty');
});

test('watchlist.json: all tickers are non-empty uppercase strings', () => {
  const { tickers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'watchlist.json'), 'utf8'));
  for (const t of tickers) {
    assert.equal(typeof t, 'string', `ticker "${t}" is not a string`);
    assert.ok(t.length > 0, 'ticker must not be empty string');
    assert.equal(t, t.toUpperCase(), `ticker "${t}" is not uppercase`);
    assert.ok(/^[A-Z0-9.]+$/.test(t), `ticker "${t}" contains invalid characters`);
  }
});

test('watchlist.json: no duplicate tickers', () => {
  const { tickers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'watchlist.json'), 'utf8'));
  const seen = new Set();
  for (const t of tickers) {
    assert.ok(!seen.has(t), `duplicate ticker: "${t}"`);
    seen.add(t);
  }
});

// ── fundamentals + signalBlock ────────────────────────────────────────────────

test('signalBlock: score is a finite number', () => {
  const quote = makeQuote();
  const sum   = makeSummary();
  const hist  = makeHistoryFull(30).map(d => ({ date: d.date, close: d.close }));
  const fund  = fundamentals(sum, quote);
  const tech  = technicals(hist);
  const sigs  = signalBlock(fund, tech);
  assert.equal(typeof sigs.score, 'number');
  assert.ok(isFinite(sigs.score), 'score must be finite');
});

test('signalBlock: overall is one of the five known verdicts', () => {
  const VERDICTS = new Set(['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL']);
  const fund = fundamentals(makeSummary(), makeQuote());
  const tech = technicals(makeHistoryFull(30).map(d => ({ date: d.date, close: d.close })));
  const sigs = signalBlock(fund, tech);
  assert.ok(VERDICTS.has(sigs.overall), `Unknown overall: "${sigs.overall}"`);
});

test('signalBlock: signals is an array of objects with label and verdict', () => {
  const fund = fundamentals(makeSummary(), makeQuote());
  const sigs = signalBlock(fund, null);
  assert.ok(Array.isArray(sigs.signals));
  for (const s of sigs.signals) {
    assert.equal(typeof s.label, 'string');
    assert.ok(['bullish', 'bearish', 'neutral'].includes(s.verdict), `bad verdict: ${s.verdict}`);
  }
});

// ── valuationAnalysis ─────────────────────────────────────────────────────────

test('valuationAnalysis: peScenarios null when EPS is negative', () => {
  const fund = fundamentals(
    makeSummary({ financialData: { ...makeSummary().financialData } }),
    makeQuote()
  );
  // Override EPS to negative by building a fund directly
  const val = valuationAnalysis({ ...fund, eps: '-2.00', price: 100 });
  assert.equal(val.peScenarios, null, 'peScenarios must be null for negative EPS');
});

test('valuationAnalysis: peScenarios populated when EPS positive', () => {
  const fund = fundamentals(makeSummary(), makeQuote());
  const val  = valuationAnalysis(fund);
  assert.ok(val.peScenarios != null, 'expected peScenarios for positive EPS');
  assert.ok(val.peScenarios.bear < val.peScenarios.base, 'bear < base');
  assert.ok(val.peScenarios.base < val.peScenarios.bull, 'base < bull');
});

test('valuationAnalysis: upside is null when targetPrice missing', () => {
  const fund = fundamentals(makeSummary(), makeQuote());
  const val  = valuationAnalysis({ ...fund, targetPrice: 'N/A', price: 100 });
  assert.equal(val.upside, null);
});

// ── incomeHistory ─────────────────────────────────────────────────────────────

test('incomeHistory: returns up to 4 rows', () => {
  const hist = incomeHistory(makeSummary());
  assert.ok(hist.length >= 1 && hist.length <= 4, `expected 1–4 rows, got ${hist.length}`);
});

test('incomeHistory: returns empty array when history missing', () => {
  const sum = { ...makeSummary(), incomeStatementHistory: undefined };
  const hist = incomeHistory(sum);
  assert.deepEqual(hist, []);
});

test('incomeHistory: returns empty array when history is empty', () => {
  const sum = { ...makeSummary(), incomeStatementHistory: { incomeStatementHistory: [] } };
  const hist = incomeHistory(sum);
  assert.deepEqual(hist, []);
});

test('incomeHistory: each row has date, revenue, netIncome fields', () => {
  const rows = incomeHistory(makeSummary());
  for (const row of rows) {
    assert.ok('date'      in row, 'missing date');
    assert.ok('revenue'   in row, 'missing revenue');
    assert.ok('netIncome' in row, 'missing netIncome');
  }
});

// ── computeTechnicals ─────────────────────────────────────────────────────────

test('computeTechnicals: produces all expected output fields', () => {
  const REQUIRED = [
    'price','change','sma20','sma50','sma200','rsi14','rsiLabel',
    'high52w','low52w','fromHigh','fromLow','rating',
    'trendScore','momScore','volScore','volumeScore','entry','stop',
  ];
  const hist  = makeHistoryFull(252);
  const quote = makeQuote();
  const ta    = computeTechnicals(quote, hist);
  for (const field of REQUIRED) {
    assert.ok(field in ta, `Missing field: ${field}`);
  }
});

test('computeTechnicals: rating is BULLISH / NEUTRAL / BEARISH', () => {
  const ta = computeTechnicals(makeQuote(), makeHistoryFull(252));
  assert.ok(['BULLISH','NEUTRAL','BEARISH'].includes(ta.rating), `Bad rating: ${ta.rating}`);
});

test('computeTechnicals: rsi14 in 0–100 when enough history', () => {
  const ta = computeTechnicals(makeQuote(), makeHistoryFull(252));
  if (ta.rsi14 != null) {
    assert.ok(ta.rsi14 >= 0 && ta.rsi14 <= 100, `RSI out of range: ${ta.rsi14}`);
  }
});

// ── Full pipeline smoke test ──────────────────────────────────────────────────

const REQUIRED_SECTIONS = ['## Thesis', '## Technicals', '## Options Flow', '## Risks', '## Price Targets'];

test('pipeline: full flow produces report with all required sections', () => {
  const quote   = makeQuote();
  const sum     = makeSummary();
  const histArr = makeHistoryFull(252).map(d => ({ date: d.date, close: d.close }));
  const histFull = makeHistoryFull(252);
  const optData  = makeOptData(100, 14);

  const fund = fundamentals(sum, quote);
  const tech = technicals(histArr);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const hist = incomeHistory(sum);
  const ta   = computeTechnicals(quote, histFull);
  const opts = computeOptions(quote, optData, null);

  const report = buildMarkdownReport({ symbol: 'TEST', fund, val, sigs, hist, ta, opts });

  for (const section of REQUIRED_SECTIONS) {
    assert.ok(report.includes(section), `Missing section: "${section}"`);
  }
});

test('pipeline: report without opts still has 4 required sections', () => {
  const quote   = makeQuote();
  const sum     = makeSummary();
  const histArr = makeHistoryFull(252).map(d => ({ date: d.date, close: d.close }));
  const histFull = makeHistoryFull(252);

  const fund = fundamentals(sum, quote);
  const tech = technicals(histArr);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const hist = incomeHistory(sum);
  const ta   = computeTechnicals(quote, histFull);

  const report = buildMarkdownReport({ symbol: 'TEST', fund, val, sigs, hist, ta, opts: null });

  for (const section of ['## Thesis', '## Technicals', '## Risks', '## Price Targets']) {
    assert.ok(report.includes(section), `Missing section: "${section}"`);
  }
  assert.ok(!report.includes('## Options Flow'), 'Options Flow must be absent when opts=null');
});

// ── Pipeline for every watchlist ticker (data-shape smoke test) ───────────────
// Uses the same synthetic data for each ticker — validates that ticker symbol
// does not affect pipeline correctness and no per-symbol crash occurs.

test('pipeline: runs without error for every watchlist ticker', () => {
  const { tickers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'watchlist.json'), 'utf8'));
  const sum     = makeSummary();
  const histFull = makeHistoryFull(252);
  const histArr  = histFull.map(d => ({ date: d.date, close: d.close }));

  for (const symbol of tickers) {
    const quote = { ...makeQuote(), symbol, longName: `${symbol} Corp` };
    const fund  = fundamentals(sum, quote);
    const tech  = technicals(histArr);
    const val   = valuationAnalysis(fund);
    const sigs  = signalBlock(fund, tech);
    const hist  = incomeHistory(sum);
    const ta    = computeTechnicals(quote, histFull);
    const opts  = computeOptions(quote, makeOptData(100, 14), null);
    const report = buildMarkdownReport({ symbol, fund, val, sigs, hist, ta, opts });

    assert.ok(typeof report === 'string' && report.length > 0,
      `${symbol}: report is empty`);
    assert.ok(report.includes('## Thesis'), `${symbol}: missing ## Thesis`);
    assert.ok(report.includes('## Risks'),  `${symbol}: missing ## Risks`);
  }
});
