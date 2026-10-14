import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardHtml } from '../src/card.js';

const base = {
  sym: '2330', fund: { price: 100, change1d: 1.5, name: 'TSMC' }, ta: { rsi14: 50, entry: '$98.00–$101.00', stop: '$95.00 (below SMA50)' },
  val: null, sigs: { signals: [], score: 6 }, conviction: 6, opts: null, hist: [],
};

test('TW card: NT$, red-up convention, chips panel, no IV cell', () => {
  const h = buildCardHtml({ ...base, market: 'TW', zhName: '台積電', chips: { date: '2026/10/14', foreign: -6752000, trust: 800000, dealer: 536000, total: -5416000 } });
  assert.match(h, /NT\$100\.00/);
  assert.match(h, /color:#E8445A[^>]*>.*?\+1\.50%|\.chg\{[^}]*color:#E8445A/s);
  assert.match(h, /三大法人買賣超（張）/);
  assert.match(h, /−?-?6,752/); assert.match(h, /\+800/);
  assert.ok(!/<span>IV<\/span>/.test(h));
  assert.match(h, /NT\$98\.00/);            // entry text uses NT$
  assert.match(h, /台積電/);
  assert.match(h, /紅漲綠跌/);
});

test('US card keeps $ and green-up, no chips panel', () => {
  const h = buildCardHtml({ ...base, sym: 'AAPL', fund: { ...base.fund, change1d: 1.5 } });
  assert.match(h, /\$100\.00/); assert.ok(!h.includes('NT$')); assert.match(h, /\.chg\{[^}]*color:#3DCC8A/);
  assert.ok(!h.includes('三大法人')); assert.match(h, /<span>IV<\/span>/);
});

test('flat day shows neutral dash', () => {
  const h = buildCardHtml({ ...base, fund: { ...base.fund, change1d: 0 } });
  assert.match(h, /─ \+0\.00%/); assert.match(h, /\.chg\{[^}]*color:#9AA6B8/);
});
