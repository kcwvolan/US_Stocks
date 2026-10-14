import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, parseT86, parseBFI82U, topN, lots, isStock } from '../src/twchips.js';

const fields = ['證券代號', '證券名稱', '外陸資買賣超股數(不含外資自營商)', '外資自營商買賣超股數', '投信買賣超股數', '自營商買賣超股數', '三大法人買賣超股數'];
const row = (c, n, f1, f2, it, dl) => [c, n + '   ', f1, f2, it, dl, String(num(f1) + num(f2) + num(it) + num(dl))];
const t86 = { stat: 'OK', fields, data: [
  row('2330', '台積電', '10,000,000', '0', '1,000', '2,000'),
  row('2317', '鴻海', '-5,000,000', '-1,000', '0', '0'),
  row('0050', '元大台灣50', '9,000,000', '0', '0', '0'),
  row('1101', '台泥', '0', '0', '0', '0'),
  row('2454', '聯發科', '3,000,000', '0', '-2,000,000', '5'),
] };

test('num strips thousands separators and bad values', () => {
  assert.equal(num('1,234,567'), 1234567); assert.equal(num('-3,000'), -3000);
  assert.equal(num('--'), 0); assert.equal(num(undefined), 0);
});

test('parseT86 merges foreign columns and trims names', () => {
  const r = parseT86(t86);
  assert.equal(r.length, 5);
  assert.deepEqual(r[1], { code: '2317', name: '鴻海', foreign: -5001000, trust: 0, dealer: 0, total: -5001000 });
  assert.equal(r[0].total, 10003000);
});

test('parseT86 returns [] for non-OK / empty and throws on layout change', () => {
  assert.deepEqual(parseT86({ stat: '很抱歉，沒有符合條件的資料!' }), []);
  assert.deepEqual(parseT86({ stat: 'OK', fields, data: [] }), []);
  assert.throws(() => parseT86({ stat: 'OK', fields: ['a'], data: [['x']] }), /欄位格式改變/);
});

test('topN ranks, excludes ETFs and zero rows', () => {
  const r = parseT86(t86);
  const { buy, sell } = topN(r, 'foreign', 10);
  assert.deepEqual(buy.map(x => x.code), ['2330', '2454']);
  assert.deepEqual(sell.map(x => x.code), ['2317']);
  assert.equal(isStock({ code: '0050' }), false); assert.equal(isStock({ code: '2330' }), true);
  assert.equal(topN(r, 'trust', 1).sell[0].code, '2454');
});

test('parseBFI82U sums foreign and dealer in 億元', () => {
  const j = { stat: 'OK', data: [
    ['自營商(自行買賣)', '0', '0', '-2,509,629,033'], ['自營商(避險)', '0', '0', '-8,960,776,977'],
    ['投信', '0', '0', '16,027,132,708'], ['外資及陸資(不含外資自營商)', '0', '0', '-20,037,340,628'],
    ['外資自營商', '0', '0', '0'], ['合計', '0', '0', '-15,480,613,930'],
  ] };
  const s = parseBFI82U(j);
  assert.ok(Math.abs(s.foreign + 200.37340628) < 1e-9); assert.ok(Math.abs(s.trust - 160.27132708) < 1e-9);
  assert.ok(Math.abs(s.dealer + 114.70406010) < 1e-9); assert.ok(Math.abs(s.total + 154.80613930) < 1e-9);
  assert.equal(parseBFI82U({ stat: 'x' }), null);
});

test('lots converts shares to 張', () => { assert.equal(lots(1500), 2); assert.equal(lots(-77005602), -77006); });

import { parseTpex, pickWatch } from '../src/twchips.js';
test('parseTpex reads the fixed 24-column layout', () => {
  const r = Array(24).fill('0'); r[0] = '7734'; r[1] = '印能科技'; r[10] = '-36,331'; r[13] = '5,000'; r[22] = '2,456'; r[23] = '-28,875';
  const j = { stat: 'ok', tables: [{ fields: Array(24).fill('x'), data: [r] }] };
  assert.deepEqual(parseTpex(j), [{ code: '7734', name: '印能科技', foreign: -36331, trust: 5000, dealer: 2456, total: -28875 }]);
  assert.deepEqual(parseTpex({ stat: 'ok', tables: [{ fields: [], data: [] }] }), []);
  assert.deepEqual(parseTpex(null), []);
  assert.throws(() => parseTpex({ stat: 'ok', tables: [{ fields: ['a'], data: [['x']] }] }), /欄位格式改變/);
});
test('pickWatch keeps watch order and nulls missing codes', () => {
  const p = pickWatch([{ code: '2330', total: 1 }], [{ code: '0000', name: '指數' }, { code: '2330', name: '台積電' }]);
  assert.equal(p[0].row, null); assert.equal(p[1].row.total, 1); assert.equal(p[1].name, '台積電');
});
