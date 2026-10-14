import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rsiArr } from '../src/technicals.js';
import { technicals } from '../src/analyze.js';

// Expected values come from an independent Wilder RSI(14) implementation (Python), not from rsiArr itself.
const CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03,
  45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45,
  45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];

test('rsiArr: first 14 entries are null, first value at index 14', () => {
  const r = rsiArr(CLOSES);
  assert.equal(r.length, CLOSES.length);
  for (let i = 0; i < 14; i++) assert.equal(r[i], null, `index ${i}`);
  assert.ok(Math.abs(r[14] - 70.464135) < 1e-5, `got ${r[14]}`);
});

test('rsiArr: Wilder smoothing matches the reference at indexes 15, 20, 32', () => {
  const r = rsiArr(CLOSES);
  assert.ok(Math.abs(r[15] - 66.249619) < 1e-5, `got ${r[15]}`);
  assert.ok(Math.abs(r[20] - 62.880718) < 1e-5, `got ${r[20]}`);
  assert.ok(Math.abs(r[32] - 37.788772) < 1e-5, `got ${r[32]}`);
});

test('rsiArr: all nulls with 14 or fewer closes', () => {
  assert.ok(rsiArr(CLOSES.slice(0, 14)).every(v => v === null));
  assert.equal(rsiArr(CLOSES.slice(0, 15)).at(-1) != null, true);
});

test('rsiArr: all gains = 100, all losses = 0, flat = 50', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  const flat = new Array(30).fill(100);
  assert.equal(rsiArr(up).at(-1), 100);
  assert.equal(rsiArr(down).at(-1), 0);
  assert.equal(rsiArr(flat).at(-1), 50);
});

test('technicals(): rsi14 equals the last Wilder value', () => {
  const hist = CLOSES.map((close, i) => ({ date: new Date(2026, 0, i + 1), close }));
  const t = technicals(hist);
  assert.ok(Math.abs(parseFloat(t.rsi14) - 37.79) < 0.01, `got ${t.rsi14}`);
});
