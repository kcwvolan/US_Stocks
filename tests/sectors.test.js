import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { etDate, sectorZh, toEntries, mergeMovers, appendMovers, readLog, resolveSectors, sectorStats, UNKNOWN } from '../src/sectors.js';

test('etDate gives the New York calendar date', () => {
  assert.equal(etDate(Date.UTC(2026, 9, 14, 3, 0) / 1000), '2026-10-13');   // 11pm EDT previous day
  assert.equal(etDate(Date.UTC(2026, 9, 14, 20, 0) / 1000), '2026-10-14');
});

test('sectorZh translates and falls back', () => {
  assert.equal(sectorZh('Technology'), '科技'); assert.equal(sectorZh(null), UNKNOWN); assert.equal(sectorZh('Weird'), 'Weird');
});

test('toEntries skips quotes without time and rounds chg', () => {
  const t = Date.UTC(2026, 9, 14, 20) / 1000;
  const e = toEntries('gainers', [{ symbol: 'A', time: t, changePct: 12.3456 }, { symbol: 'B', time: null }], s => 'Energy');
  assert.deepEqual(e, [{ date: '2026-10-14', list: 'gainers', sym: 'A', sector: 'Energy', chg: 12.35 }]);
});

test('mergeMovers is keyed by date+list+sym and appendMovers is idempotent', () => {
  const a = { date: '2026-10-13', list: 'gainers', sym: 'A', sector: 'Energy', chg: 1 };
  assert.equal(mergeMovers([a], [{ ...a, chg: 2 }, { ...a, list: 'losers' }]).length, 2);
  const f = join(mkdtempSync(join(tmpdir(), 'mv-')), 'x', 'log.jsonl');
  appendMovers(f, [a]); appendMovers(f, [a]);
  assert.equal(readLog(f).length, 1); assert.equal(readFileSync(f, 'utf8').split('\n').filter(Boolean).length, 1);
});

test('resolveSectors caches, stores null for no-sector, retries failures', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'sc-')), 'c.json');
  let calls = 0;
  const fetchP = async s => { calls++; if (s === 'BAD') throw new Error('net'); return { sector: s === 'ETF1' ? null : 'Technology' }; };
  let c = await resolveSectors(['A', 'ETF1', 'BAD', 'A'], f, fetchP, { delayMs: 0 });
  assert.deepEqual(c, { A: 'Technology', ETF1: null }); assert.equal(calls, 3);
  c = await resolveSectors(['A', 'ETF1', 'BAD'], f, fetchP, { delayMs: 0 });
  assert.equal(calls, 4);   // only BAD retried
});

test('sectorStats windows count distinct dates, net and averages', () => {
  const mk = (date, list, sym, sector, chg) => ({ date, list, sym, sector, chg });
  const log = [
    mk('2026-10-01', 'gainers', 'A', 'Technology', 10), mk('2026-10-01', 'losers', 'B', 'Energy', -5),
    mk('2026-10-02', 'gainers', 'C', 'Technology', 20), mk('2026-10-02', 'gainers', 'D', null, 4),
    mk('2026-10-02', 'actives', 'E', 'Technology', 1),
  ];
  const [w10, w30] = sectorStats(log, [1, 30]);
  // window 1 → only the last date
  assert.equal(w10.days, 1); assert.equal(w10.full, true);
  assert.deepEqual(w10.rows.map(r => [r.sector, r.up, r.down, r.active, r.net]).sort(), [['科技', 1, 0, 1, 1], [UNKNOWN, 1, 0, 0, 1]].sort());
  assert.equal(w30.days, 2); assert.equal(w30.full, false);
  const tech = w30.rows.find(r => r.sector === '科技');
  assert.equal(tech.up, 2); assert.equal(tech.net, 2); assert.ok(Math.abs(tech.avgChg - 31 / 3) < 1e-9);
  assert.equal(w30.rows.at(-1).sector, '能源'); assert.equal(w30.rows.at(-1).net, -1);
  assert.deepEqual(sectorStats([], [10])[0].rows, []);
});

import { sectorEmbed } from '../src/sectors.js';
test('sectorEmbed focuses on 科技/能源 and marks incomplete windows', () => {
  const rows = [['科技', 5, 1, 2.34], ['金融', 9, 0, 1], ['工業', 0, 4, -1]].map(([sector, up, down, avgChg]) => ({ sector, up, down, active: 0, net: up - down, avgChg }));
  const e = sectorEmbed([{ window: 10, days: 3, full: false, rows }, { window: 30, days: 0, full: false, rows: [] }]);
  assert.equal(e.fields[0].name, '近 10 日（累積 3/10 日）');
  assert.match(e.fields[0].value, /🟢 科技 ↑5 ↓1（淨 \+4）均 \+2\.3%/);
  assert.match(e.fields[0].value, /⚪ 能源 無上榜/);
  assert.ok(!e.fields[0].value.includes('金融') && !e.fields[0].value.includes('工業'));
  assert.match(e.title, /科技、能源/);
  assert.match(sectorEmbed([{ window: 10, days: 1, full: false, rows }], ['工業']).fields[0].value, /🔴 工業/);
});
