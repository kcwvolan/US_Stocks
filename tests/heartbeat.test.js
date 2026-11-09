import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { markSuccess, readMarks, missingJobs, taipeiDate, JOBS } from '../src/heartbeat.js';

test('taipeiDate uses Taipei calendar day', () => {
  assert.equal(taipeiDate(new Date('2026-11-09T17:00:00Z')), '2026-11-10');   // 01:00 next day in Taipei
  assert.equal(taipeiDate(new Date('2026-11-09T10:00:00Z')), '2026-11-09');
});

test('markSuccess writes per-job marks and keeps others', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hb-')), 'd', 'm.json');
  markSuccess(f, 'watchlist', 'ok', new Date('2026-11-09T10:10:00Z'));
  markSuccess(f, 'tw-chips', 'skipped', new Date('2026-11-09T09:30:00Z'));
  const m = readMarks(f);
  assert.equal(m.watchlist.date, '2026-11-09'); assert.equal(m['tw-chips'].status, 'skipped');
  assert.deepEqual(readMarks(join(tmpdir(), 'nope-hb.json')), {});
});

test('missingJobs lists jobs without a mark for today, with last success time', () => {
  const marks = { watchlist: { date: '2026-11-08', time: 'T1' }, 'tw-chips': { date: '2026-11-09', time: 'T2' } };
  const m = missingJobs(marks, '2026-11-09');
  assert.deepEqual(m.map(x => x.id), ['market-radar', 'watchlist']);
  assert.equal(m[1].last, 'T1'); assert.equal(m[0].last, null);
  assert.equal(missingJobs(Object.fromEntries(JOBS.map(j => [j.id, { date: 'D' }])), 'D').length, 0);
  assert.equal(missingJobs(null, 'D').length, JOBS.length);
});
