import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMarkdownReport } from '../src/report.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeFund(overrides = {}) {
  return {
    symbol: 'TEST', name: 'Test Corp', price: 100, change1d: '5.00',
    marketCap: '50.00B', pe: '25.00', forwardPE: '20.00', eps: '4.00',
    pbRatio: '3.00', roe: '20.00%', revenueGrowth: '15.00%',
    grossMargin: '55.00%', operatingMargin: '25.00%',
    debtToEquity: '30.00', currentRatio: '2.00',
    targetPrice: '120.00', recommendation: 'buy',
    ...overrides,
  };
}

function makeVal(overrides = {}) {
  return {
    peScenarios: { bear: 60, base: 100, bull: 160 },
    pbScenarios: null,
    upside: 20.0,
    targetPrice: 120,
    ...overrides,
  };
}

function makeSigs(overrides = {}) {
  return {
    score: 3.5,
    signals: [
      { label: 'Above SMA20', verdict: 'bullish' },
      { label: 'RSI 55 — Neutral', verdict: 'neutral' },
    ],
    overall: 'BUY',
    ...overrides,
  };
}

function makeHist() {
  return [
    { date: '2024-01-01', revenue: 100e9, grossProfit: 55e9, netIncome: 20e9 },
    { date: '2023-01-01', revenue: 87e9, grossProfit: 48e9, netIncome: 17e9 },
  ];
}

function makeTa(overrides = {}) {
  return {
    price: 100, change: 5.26,
    sma20: 95, sma50: 90, sma200: 80,
    ema12: 96, ema26: 92,
    macd: 1.2, macdSignal: 0.9, macdHist: 0.3,
    rsi14: 55, rsiLabel: 'NEUTRAL',
    bb: { upper: 110, middle: 95, lower: 80 },
    atr14: 2.5, stoch: { k: 60, d: 55 },
    pivots: { r2: 112, r1: 106, pivot: 100, s1: 94, s2: 88 },
    high52w: 115, low52w: 70, fromHigh: -13.0, fromLow: 42.8,
    recentVol: 1200000, avgVol: 1000000, volRatio: 1.2,
    trendBull: true, trendBear: false, rating: 'BULLISH',
    trendScore: 5, momScore: 4, volScore: 3, volumeScore: 3,
    entry: '$94.05–$95.95 (SMA20 zone)', stop: '$87.30 (below SMA50)',
    ...overrides,
  };
}

function makeOpts(overrides = {}) {
  const expTs = Math.floor((Date.now() + 14 * 86400000) / 1000);
  return {
    price: 100, dte1: 14,
    expiry1: '05/22/2026',
    atm: 100, dteWarning: null,
    straddle: 5.50, straddlePct: 5.5,
    iv1: 0.30, ivEnv: 'MODERATE',
    pcr: 0.85, mp: 98,
    chainRows: [
      { strike: 98,  isATM: false, callPrice: 3.50, callSource: 'mid', callIV: 0.32, putPrice: 1.80, putSource: 'mid', putIV: 0.34 },
      { strike: 100, isATM: true,  callPrice: 2.75, callSource: 'mid', callIV: 0.30, putPrice: 2.75, putSource: 'mid', putIV: 0.31 },
      { strike: 102, isATM: false, callPrice: 1.80, callSource: 'mid', callIV: 0.29, putPrice: 3.50, putSource: 'mid', putIV: 0.33 },
    ],
    earningsTs: null, daysToEarnings: null, earningsNear: false, highIV: false,
    strategy: {
      name: 'BULL CALL SPREAD',
      legs: 'Buy $100 Call + Sell $105 Call',
      rationale: 'Defined risk in normal IV environment',
    },
    ...overrides,
  };
}

const REQUIRED_SECTIONS = [
  '## Thesis',
  '## Technicals',
  '## Options Flow',
  '## Risks',
  '## Price Targets',
];

function fullFixture() {
  return {
    symbol: 'TEST',
    fund: makeFund(),
    val: makeVal(),
    sigs: makeSigs(),
    hist: makeHist(),
    ta: makeTa(),
    opts: makeOpts(),
  };
}

// ── Section presence ──────────────────────────────────────────────────────────

test('report: all 5 required sections present with full data', () => {
  const report = buildMarkdownReport(fullFixture());
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(report.includes(section), `Missing required section: "${section}"`);
  }
});

test('report: each required section is a level-2 heading', () => {
  const report = buildMarkdownReport(fullFixture());
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(report.includes('\n' + section + '\n') || report.startsWith(section + '\n'),
      `Section "${section}" is not a standalone ## heading`);
  }
});

test('report: Thesis always present (no conditional guard)', () => {
  // Even minimal data should produce a Thesis section
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('## Thesis'));
});

test('report: Risks always present', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('## Risks'));
});

test('report: Price Targets always present', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('## Price Targets'));
});

test('report: Technicals present when ta is provided', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('## Technicals'));
});

test('report: Technicals absent when ta is null', () => {
  const report = buildMarkdownReport({ ...fullFixture(), ta: null });
  assert.ok(!report.includes('## Technicals'), 'Technicals section must not appear when ta=null');
});

test('report: Options Flow present when opts is provided', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('## Options Flow'));
});

test('report: Options Flow absent when opts is null', () => {
  const report = buildMarkdownReport({ ...fullFixture(), opts: null });
  assert.ok(!report.includes('## Options Flow'), 'Options Flow must not appear when opts=null');
});

// ── Content spot-checks ───────────────────────────────────────────────────────

test('report: strategy name appears in Options Flow', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('BULL CALL SPREAD'), 'Strategy name missing from Options Flow');
});

test('report: company name appears in Thesis', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('Test Corp'), 'Company name missing from Thesis');
});

test('report: price appears in header', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('$100'), 'Price missing from header');
});

test('report: analyst target appears in Price Targets when upside provided', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.ok(report.includes('$120'), 'Analyst target missing from Price Targets');
});

test('report: returns a non-empty string', () => {
  const report = buildMarkdownReport(fullFixture());
  assert.equal(typeof report, 'string');
  assert.ok(report.length > 500, `Report too short: ${report.length} chars`);
});

test('report: no required section missing when opts=null and ta=null', () => {
  // Thesis, Fundamentals, Risks, Price Targets should still appear
  const report = buildMarkdownReport({ ...fullFixture(), ta: null, opts: null });
  for (const section of ['## Thesis', '## Risks', '## Price Targets']) {
    assert.ok(report.includes(section), `Section "${section}" missing with ta=null, opts=null`);
  }
});

test('report: pre-profit company labelled correctly in Thesis', () => {
  const report = buildMarkdownReport({ ...fullFixture(), fund: makeFund({ eps: '-1.50' }) });
  assert.ok(report.includes('pre-profit'), 'Expected "pre-profit" label for negative EPS');
});
