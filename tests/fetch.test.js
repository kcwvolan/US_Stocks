import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickNextExpiry } from '../src/fetch.js';
import { dte } from '../src/options.js';

const SEC_PER_DAY = 86400;

function futureTs(daysFromNow) {
  return Math.floor((Date.now() + daysFromNow * SEC_PER_DAY * 1000) / 1000);
}

// ── pickNextExpiry ──────────────────────────────────────────────────────────

test('pickNextExpiry: returns first date when first DTE >= floor', () => {
  const dates = [futureTs(14), futureTs(21), futureTs(28)];
  assert.equal(pickNextExpiry(dates, 7), dates[0]);
});

test('pickNextExpiry: skips dates below floor, returns first qualifying', () => {
  const dates = [futureTs(3), futureTs(5), futureTs(10), futureTs(21)];
  assert.equal(pickNextExpiry(dates, 7), dates[2]);
});

test('pickNextExpiry: returns null when no date meets floor', () => {
  const dates = [futureTs(1), futureTs(3), futureTs(5)];
  assert.equal(pickNextExpiry(dates, 7), null);
});

test('pickNextExpiry: handles empty array', () => {
  assert.equal(pickNextExpiry([], 7), null);
});

test('pickNextExpiry: handles null', () => {
  assert.equal(pickNextExpiry(null, 7), null);
});

test('pickNextExpiry: handles undefined', () => {
  assert.equal(pickNextExpiry(undefined, 7), null);
});

test('pickNextExpiry: floor=0 returns first date', () => {
  const dates = [futureTs(2), futureTs(14)];
  assert.equal(pickNextExpiry(dates, 0), dates[0]);
});

// ── dte() ───────────────────────────────────────────────────────────────────

test('dte: ~3 days for timestamp 3 days out', () => {
  const ts = futureTs(3);
  assert.ok(Math.abs(dte(ts) - 3) <= 1, `expected ~3, got ${dte(ts)}`);
});

test('dte: negative for past timestamp', () => {
  const ts = Math.floor((Date.now() - 3 * SEC_PER_DAY * 1000) / 1000);
  assert.ok(dte(ts) < 0, `expected negative, got ${dte(ts)}`);
});

test('dte: ~0 for timestamp within current day', () => {
  const ts = Math.floor(Date.now() / 1000) + 43200; // 12h from now
  assert.ok(Math.abs(dte(ts)) <= 1, `expected ~0, got ${dte(ts)}`);
});

// ── DTE window contract (integration of pickNextExpiry + dte) ───────────────
// Verify the two functions agree: the chosen expiry satisfies dte >= floor.

test('DTE window: picked expiry always satisfies the floor', () => {
  const floor = 7;
  const dates = [futureTs(2), futureTs(5), futureTs(10), futureTs(14), futureTs(21)];
  const chosen = pickNextExpiry(dates, floor);
  assert.ok(chosen != null, 'expected a qualifying expiry');
  assert.ok(dte(chosen) >= floor, `chosen DTE ${dte(chosen)} is below floor ${floor}`);
});

test('DTE window: expiry below floor is never returned', () => {
  const floor = 7;
  const dates = [futureTs(1), futureTs(3), futureTs(5)];
  const chosen = pickNextExpiry(dates, floor);
  assert.equal(chosen, null);
  // Confirm that each date actually has DTE < floor (validates the fixture itself)
  for (const d of dates) assert.ok(dte(d) < floor);
});

import { dayChange } from '../src/fetch.js';
test('dayChange uses the previous daily close, not the 5-day-window start', () => {
  const r = dayChange(2490, { chartPreviousClose: 2585 }, [2585, 2600, 2550, 2490, 2490]);
  assert.equal(r.prev, 2490); assert.equal(r.change, 0);
  assert.equal(dayChange(110, { previousClose: 100, chartPreviousClose: 50 }, [1, 2]).change, 10);
  assert.equal(dayChange(105, {}, [null, 100, 105]).prev, 100);
  assert.equal(dayChange(105, { chartPreviousClose: 90 }, [105]).prev, 90);
  assert.equal(dayChange(null, {}, []).change, null);
});
