import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { makeEntry, mergeEntries, appendRatings, readLog, forwardReturns, summarize } from '../src/ratinglog.js';
import { ratingLabel } from '../src/analyze.js';

const bars = [100, 102, 101, 105, 110, 108, 120].map((close, i) => ({ date: new Date(Date.UTC(2026, 9, 1 + i, 13, 30)), close }));

test('ratingLabel thresholds', () => {
  assert.equal(ratingLabel(6), '強力買入'); assert.equal(ratingLabel(5.99), '買入');
  assert.equal(ratingLabel(3), '買入'); assert.equal(ratingLabel(0), '持有');
  assert.equal(ratingLabel(-0.5), '賣出'); assert.equal(ratingLabel(-3), '賣出'); assert.equal(ratingLabel(-3.5), '強力賣出');
});

test('makeEntry uses last bar date and price', () => {
  const e = makeEntry({ sym: 'X', ta: { rsi14: 55.123 }, sigs: { score: 2 }, val: null, opts: null, conviction: 2, hist: bars });
  assert.equal(e.date, '2026-10-07'); assert.equal(e.price, 120); assert.equal(e.rating, '持有'); assert.equal(e.rsi14, 55.12);
  assert.equal(makeEntry({ sym: 'X', hist: [] }), null);
});

test('mergeEntries replaces same date+symbol and sorts', () => {
  const a = [{ date: '2026-10-02', sym: 'B', conviction: 1 }, { date: '2026-10-01', sym: 'A', conviction: 1 }];
  const m = mergeEntries(a, [{ date: '2026-10-02', sym: 'B', conviction: 4 }, null]);
  assert.deepEqual(m.map(e => `${e.date}${e.sym}${e.conviction}`), ['2026-10-01A1', '2026-10-02B4']);
});

test('appendRatings is idempotent and readLog skips bad lines', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'rl-')), 'sub', 'log.jsonl');
  appendRatings(f, [{ date: '2026-10-01', sym: 'A', conviction: 1 }]);
  appendRatings(f, [{ date: '2026-10-01', sym: 'A', conviction: 2 }]);
  assert.equal(readLog(f).length, 1); assert.equal(readLog(f)[0].conviction, 2);
  assert.equal(readFileSync(f, 'utf8').split('\n').filter(Boolean).length, 1);
});

test('forwardReturns counts trading bars, null when not enough', () => {
  const r = forwardReturns({ date: '2026-10-02', price: 102 }, bars, [1, 5, 20]);
  assert.ok(Math.abs(r[1] - (101 / 102 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(r[5] - (120 / 102 - 1) * 100) < 1e-9);
  assert.equal(r[20], null);
  assert.equal(forwardReturns({ date: '2025-01-01', price: 1 }, bars)[1], null);
});

test('summarize averages per rating and win rate', () => {
  const s = summarize([
    { entry: { rating: '買入' }, ret: { 1: 2, 5: null, 20: null } },
    { entry: { rating: '買入' }, ret: { 1: -1, 5: null, 20: null } },
    { entry: { rating: '持有' }, ret: { 1: null, 5: null, 20: null } },
  ]);
  const b = s.find(x => x.rating === '買入');
  assert.equal(b.n, 2); assert.equal(b.horizons[1].avg, 0.5); assert.equal(b.horizons[1].win, 50); assert.equal(b.horizons[5].avg, null);
  assert.equal(s.find(x => x.rating === '持有').horizons[1].n, 0);
});
