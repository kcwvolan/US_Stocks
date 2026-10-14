import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optPriceDetail, optPrice, computeOptions, ivOrNull, atmIV } from '../src/options.js';

// ── optPriceDetail fallback chain ─────────────────────────────────────────────

test('optPriceDetail: mid when bid and ask both > 0', () => {
  const r = optPriceDetail({ bid: 2.00, ask: 3.00, lastPrice: 9.99 });
  assert.equal(r.price, 2.50);
  assert.equal(r.source, 'mid');
});

test('optPriceDetail: last when bid == 0', () => {
  const r = optPriceDetail({ bid: 0, ask: 3.00, lastPrice: 2.80 });
  assert.equal(r.price, 2.80);
  assert.equal(r.source, 'last');
});

test('optPriceDetail: ask/2 when bid == 0 and lastPrice == 0', () => {
  const r = optPriceDetail({ bid: 0, ask: 4.00, lastPrice: 0 });
  assert.equal(r.price, 2.00);
  assert.equal(r.source, 'ask/2');
});

test('optPriceDetail: null when all prices are zero', () => {
  const r = optPriceDetail({ bid: 0, ask: 0, lastPrice: 0 });
  assert.equal(r.price, null);
  assert.equal(r.source, null);
});

test('optPriceDetail: null for null input', () => {
  const r = optPriceDetail(null);
  assert.equal(r.price, null);
  assert.equal(r.source, null);
});

test('optPriceDetail: null for undefined input', () => {
  const r = optPriceDetail(undefined);
  assert.equal(r.price, null);
  assert.equal(r.source, null);
});

test('optPrice: returns number directly (wrapper sanity)', () => {
  assert.equal(optPrice({ bid: 1, ask: 3, lastPrice: 0 }), 2);
  assert.equal(optPrice({ bid: 0, ask: 0, lastPrice: 5 }), 5);
  assert.equal(optPrice(null), null);
});

// ── computeOptions: illiquid ticker simulation ────────────────────────────────
// Simulates a ticker where bid=0 on all contracts (illiquid), confirming that
// chainRows use lastPrice or ask/2 fallbacks and never show null for live contracts.

function makeChain(expirationDate, strikes, price, { forceZeroBid = false } = {}) {
  const calls = strikes.map(strike => ({
    strike,
    bid: forceZeroBid ? 0 : Math.max(0.05, price - strike + 1),
    ask: Math.max(0.05, price - strike + 1.5),
    lastPrice: Math.max(0.01, price - strike + 0.8),
    openInterest: 100,
    impliedVolatility: 0.35,
  }));
  const puts = strikes.map(strike => ({
    strike,
    bid: forceZeroBid ? 0 : Math.max(0.05, strike - price + 1),
    ask: Math.max(0.05, strike - price + 1.5),
    lastPrice: Math.max(0.01, strike - price + 0.8),
    openInterest: 80,
    impliedVolatility: 0.38,
  }));
  return { expirationDate, calls, puts };
}

function makeOptData(strikes, price, { forceZeroBid = false, dteDays = 14 } = {}) {
  const expTs = Math.floor((Date.now() + dteDays * 86400000) / 1000);
  const chain = makeChain(expTs, strikes, price, { forceZeroBid });
  return {
    options: [chain],
    strikes,
    expirationDates: [expTs],
  };
}

const PRICE = 50;
const STRIKES = [47, 48, 49, 50, 51, 52, 53];
const QUOTE = { regularMarketPrice: PRICE, regularMarketChangePercent: 1.5 };
const CALENDAR = null;

test('computeOptions: chainRows populated with mid when bid > 0', () => {
  const optData = makeOptData(STRIKES, PRICE);
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result, 'result should not be null');
  const atmRow = result.chainRows.find(r => r.isATM);
  assert.ok(atmRow, 'ATM row should exist');
  assert.ok(atmRow.callPrice != null, 'callPrice should not be null');
  assert.equal(atmRow.callSource, 'mid', 'source should be mid when bid > 0');
  assert.ok(atmRow.putPrice != null, 'putPrice should not be null');
  assert.equal(atmRow.putSource, 'mid');
});

test('computeOptions: illiquid ticker — bid=0 triggers lastPrice fallback', () => {
  const optData = makeOptData(STRIKES, PRICE, { forceZeroBid: true });
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result, 'result should not be null for illiquid data');
  for (const row of result.chainRows) {
    // bid=0 but lastPrice > 0, so every row should use 'last' fallback
    if (row.callPrice != null) assert.equal(row.callSource, 'last', `strike ${row.strike} call should use last`);
    if (row.putPrice != null) assert.equal(row.putSource, 'last', `strike ${row.strike} put should use last`);
  }
});

test('computeOptions: illiquid ticker — no null prices when lastPrice > 0', () => {
  const optData = makeOptData(STRIKES, PRICE, { forceZeroBid: true });
  const result = computeOptions(QUOTE, optData, CALENDAR);
  for (const row of result.chainRows) {
    assert.notEqual(row.callPrice, 0, `strike ${row.strike} call price must not be 0`);
    assert.notEqual(row.putPrice, 0, `strike ${row.strike} put price must not be 0`);
  }
});

test('computeOptions: strict DTE filter — chain below dteFloor returns null', () => {
  const optData = makeOptData(STRIKES, PRICE, { dteDays: 3 });
  const result = computeOptions(QUOTE, optData, CALENDAR, { dteFloor: 7 });
  assert.equal(result, null, 'all chains below dteFloor should yield null');
});

test('computeOptions: chain meeting dteFloor is included and returns result', () => {
  const optData = makeOptData(STRIKES, PRICE, { dteDays: 14 });
  const result = computeOptions(QUOTE, optData, CALENDAR, { dteFloor: 7 });
  assert.ok(result, 'chain with DTE >= floor should produce a result');
  assert.ok(result.dte1 >= 7, `dte1 ${result.dte1} should be >= 7`);
});

test('computeOptions: returns null for empty optData', () => {
  assert.equal(computeOptions(QUOTE, null, CALENDAR), null);
  assert.equal(computeOptions(QUOTE, { options: [] }, CALENDAR), null);
});

// ── IV validation ─────────────────────────────────────────────────────────────
// CLAUDE.md rule: impliedVolatility === 0 must be treated as missing (null),
// not silently displayed as 0%.

function makeChainZeroIV(expirationDate, strikes, price) {
  const calls = strikes.map(strike => ({
    strike,
    bid: Math.max(0, price - strike + 1),
    ask: Math.max(0.05, price - strike + 1.5),
    lastPrice: Math.max(0.01, price - strike + 0.8),
    openInterest: 100,
    impliedVolatility: 0,   // IV explicitly zero
  }));
  const puts = strikes.map(strike => ({
    strike,
    bid: Math.max(0, strike - price + 1),
    ask: Math.max(0.05, strike - price + 1.5),
    lastPrice: Math.max(0.01, strike - price + 0.8),
    openInterest: 80,
    impliedVolatility: 0,   // IV explicitly zero
  }));
  return { expirationDate, calls, puts };
}

function makeOptDataZeroIV(strikes, price, dteDays = 14) {
  const expTs = Math.floor((Date.now() + dteDays * 86400000) / 1000);
  const chain = makeChainZeroIV(expTs, strikes, price);
  return { options: [chain], strikes, expirationDates: [expTs] };
}

test('computeOptions: iv1 is null when ATM contract has IV=0', () => {
  const optData = makeOptDataZeroIV(STRIKES, PRICE);
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result, 'result should not be null');
  assert.equal(result.iv1, null,
    `iv1 must be null when IV=0, got: ${result.iv1}`);
});

test('computeOptions: iv1 is correct when ATM IV is a valid positive value', () => {
  const optData = makeOptData(STRIKES, PRICE);  // uses impliedVolatility: 0.35
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result.iv1 != null, 'iv1 should not be null when IV is present');
  assert.ok(result.iv1 > 0, `iv1 must be positive, got: ${result.iv1}`);
});

test('computeOptions: chainRow callIV is null when contract IV=0', () => {
  const optData = makeOptDataZeroIV(STRIKES, PRICE);
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  for (const row of result.chainRows) {
    assert.equal(row.callIV, null,
      `strike ${row.strike}: callIV must be null when IV=0, got: ${row.callIV}`);
  }
});

test('computeOptions: chainRow putIV is null when contract IV=0', () => {
  const optData = makeOptDataZeroIV(STRIKES, PRICE);
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  for (const row of result.chainRows) {
    assert.equal(row.putIV, null,
      `strike ${row.strike}: putIV must be null when IV=0, got: ${row.putIV}`);
  }
});

test('computeOptions: chainRow IV values are positive when contracts have valid IV', () => {
  const optData = makeOptData(STRIKES, PRICE);  // impliedVolatility: 0.35 / 0.38
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  for (const row of result.chainRows) {
    if (row.callIV != null) assert.ok(row.callIV > 0, `callIV must be > 0, got ${row.callIV}`);
    if (row.putIV  != null) assert.ok(row.putIV  > 0, `putIV must be > 0, got ${row.putIV}`);
  }
});

// ── Strict DTE filtering (dteMax) ────────────────────────────────────────────

test('computeOptions: chain above dteMax is excluded — returns null', () => {
  const optData = makeOptData(STRIKES, PRICE, { dteDays: 120 });
  const result = computeOptions(QUOTE, optData, CALENDAR, { dteFloor: 7, dteMax: 90 });
  assert.equal(result, null, 'chain above dteMax should yield null');
});

test('computeOptions: chain at exact dteMax boundary is included', () => {
  const optData = makeOptData(STRIKES, PRICE, { dteDays: 90 });
  const result = computeOptions(QUOTE, optData, CALENDAR, { dteFloor: 7, dteMax: 90 });
  assert.ok(result, 'chain at exactly dteMax should be included');
  assert.ok(result.dte1 <= 90, `dte1 ${result.dte1} should be <= 90`);
});

test('computeOptions: multi-chain — below-floor chain skipped, in-range chain used', () => {
  const expShort = Math.floor((Date.now() + 3 * 86400000) / 1000);
  const expMid   = Math.floor((Date.now() + 30 * 86400000) / 1000);
  const optData = {
    options: [
      makeChain(expShort, STRIKES, PRICE),
      makeChain(expMid, STRIKES, PRICE),
    ],
    strikes: STRIKES,
    expirationDates: [expShort, expMid],
  };
  const result = computeOptions(QUOTE, optData, CALENDAR, { dteFloor: 7, dteMax: 90 });
  assert.ok(result, 'should use the qualifying chain');
  assert.ok(result.dte1 >= 7, `dte1 ${result.dte1} should be >= floor`);
});

// ── lastPrice fallback when bid is null ───────────────────────────────────────

test('optPriceDetail: bid=null falls back to lastPrice', () => {
  const r = optPriceDetail({ bid: null, ask: 3.00, lastPrice: 2.80 });
  assert.equal(r.price, 2.80);
  assert.equal(r.source, 'last');
});

test('optPriceDetail: bid=null and lastPrice=null falls back to ask/2', () => {
  const r = optPriceDetail({ bid: null, ask: 4.00, lastPrice: null });
  assert.equal(r.price, 2.00);
  assert.equal(r.source, 'ask/2');
});

// ── Missing bid rate warning ──────────────────────────────────────────────────
// Warning fires when > 20% of the chain's contracts lack a usable bid.
// STRIKES has 7 elements → 14 total contracts (7 calls + 7 puts).

test('computeOptions: missingBidWarning is null when all contracts have valid bids', () => {
  const optData = makeOptData(STRIKES, PRICE);
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.equal(result.missingBidWarning, null);
});

test('computeOptions: missingBidWarning is set when all bids are zero', () => {
  const optData = makeOptData(STRIKES, PRICE, { forceZeroBid: true });
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result.missingBidWarning, 'should warn when 100% bids are missing');
  assert.ok(result.missingBidWarning.includes('%'), 'warning should include a percentage');
});

// 3 missing / 14 total = 21.4% > 20% → warning fires
test('computeOptions: missingBidWarning fires when > 20% of contracts lack bids (3/14)', () => {
  const expTs = Math.floor((Date.now() + 14 * 86400000) / 1000);
  const calls = STRIKES.map((strike, i) => ({
    strike,
    bid: i < 3 ? 0 : Math.max(0.05, PRICE - strike + 1),
    ask: Math.max(0.05, PRICE - strike + 1.5),
    lastPrice: Math.max(0.01, PRICE - strike + 0.8),
    openInterest: 100,
    impliedVolatility: 0.35,
  }));
  const puts = STRIKES.map(strike => ({
    strike,
    bid: Math.max(0.05, strike - PRICE + 1),
    ask: Math.max(0.05, strike - PRICE + 1.5),
    lastPrice: Math.max(0.01, strike - PRICE + 0.8),
    openInterest: 80,
    impliedVolatility: 0.38,
  }));
  const optData = { options: [{ expirationDate: expTs, calls, puts }], strikes: STRIKES, expirationDates: [expTs] };
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.ok(result.missingBidWarning, '3/14 = 21.4% missing bids should trigger warning');
});

// 2 missing / 14 total = 14.3% ≤ 20% → no warning
test('computeOptions: missingBidWarning is null when ≤ 20% of contracts lack bids (2/14)', () => {
  const expTs = Math.floor((Date.now() + 14 * 86400000) / 1000);
  const calls = STRIKES.map((strike, i) => ({
    strike,
    bid: i < 2 ? 0 : Math.max(0.05, PRICE - strike + 1),
    ask: Math.max(0.05, PRICE - strike + 1.5),
    lastPrice: Math.max(0.01, PRICE - strike + 0.8),
    openInterest: 100,
    impliedVolatility: 0.35,
  }));
  const puts = STRIKES.map(strike => ({
    strike,
    bid: Math.max(0.05, strike - PRICE + 1),
    ask: Math.max(0.05, strike - PRICE + 1.5),
    lastPrice: Math.max(0.01, strike - PRICE + 0.8),
    openInterest: 80,
    impliedVolatility: 0.38,
  }));
  const optData = { options: [{ expirationDate: expTs, calls, puts }], strikes: STRIKES, expirationDates: [expTs] };
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.equal(result.missingBidWarning, null, '2/14 = 14.3% should not trigger warning');
});

test('computeOptions: chainRow IV is null when contract is missing impliedVolatility field', () => {
  const expTs = Math.floor((Date.now() + 14 * 86400000) / 1000);
  const strikes = STRIKES;
  const calls = strikes.map(strike => ({
    strike,
    bid: 1, ask: 1.5, lastPrice: 1.2, openInterest: 100,
    // impliedVolatility intentionally absent
  }));
  const puts = strikes.map(strike => ({
    strike,
    bid: 1, ask: 1.5, lastPrice: 1.2, openInterest: 80,
    // impliedVolatility intentionally absent
  }));
  const optData = { options: [{ expirationDate: expTs, calls, puts }], strikes, expirationDates: [expTs] };
  const result  = computeOptions(QUOTE, optData, CALENDAR);
  for (const row of result.chainRows) {
    assert.equal(row.callIV, null, `callIV should be null when field absent`);
    assert.equal(row.putIV,  null, `putIV should be null when field absent`);
  }
});

// ── Yahoo placeholder IV (contracts with no bid/ask) ──────────────────────────

test('ivOrNull: null for 0, 1e-5 and sub-1% placeholders, NaN and missing', () => {
  for (const v of [0, 0.00001, 0.00196, 0.0078, NaN, null, undefined]) {
    assert.equal(ivOrNull(v), null, `ivOrNull(${v}) must be null`);
  }
});

test('ivOrNull: keeps real IVs (1% and above)', () => {
  assert.equal(ivOrNull(0.01), 0.01);
  assert.equal(ivOrNull(0.35), 0.35);
  assert.equal(ivOrNull(1.8), 1.8);
});

test('atmIV: falls back to the put when the call IV is a placeholder', () => {
  const chain = {
    calls: [{ strike: 100, impliedVolatility: 0.00001 }],
    puts:  [{ strike: 100, impliedVolatility: 0.42 }],
  };
  assert.equal(atmIV(chain, 100), 0.42);
});

test('atmIV: null when both sides are placeholders', () => {
  const chain = {
    calls: [{ strike: 100, impliedVolatility: 0.00001 }],
    puts:  [{ strike: 100, impliedVolatility: 0.0078 }],
  };
  assert.equal(atmIV(chain, 100), null);
});

test('computeOptions: iv1 is null when every contract carries the 1e-5 placeholder', () => {
  const optData = makeOptDataZeroIV(STRIKES, PRICE);
  for (const o of [...optData.options[0].calls, ...optData.options[0].puts]) o.impliedVolatility = 0.00001;
  const result = computeOptions(QUOTE, optData, CALENDAR);
  assert.equal(result.iv1, null);
});
