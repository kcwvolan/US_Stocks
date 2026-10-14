#!/usr/bin/env node
import { getQuote, getHistoryFull } from '../src/fetch.js';
import { smaArr, emaArr, rsiArr, bollingerBands, calcATR, calcStoch, calcPivots } from '../src/technicals.js';
import chalk from 'chalk';

const symbol = process.argv[2]?.toUpperCase();
const showChart = process.argv.includes('--chart');

if (!symbol) {
  console.error('Usage: node scripts/technical-analysis.js SYMBOL [--chart]');
  process.exit(1);
}

// ── ASCII Chart ───────────────────────────────────────────────────────────────

function buildChart(history, s20, s50, s200) {
  const W = 72, H = 16;
  const n = history.length;

  const sample = i => history[Math.min(Math.floor(i * n / W), n - 1)];
  const sampleA = (arr, i) => arr[Math.min(Math.floor(i * n / W), n - 1)];

  const cols = Array.from({ length: W }, (_, i) => ({
    close: sample(i).close,
    s20: sampleA(s20, i),
    s50: sampleA(s50, i),
    s200: sampleA(s200, i),
  }));

  const closes = cols.map(c => c.close);
  const minP = Math.min(...closes) * 0.995;
  const maxP = Math.max(...closes) * 1.005;
  const range = maxP - minP;
  const toRow = p => Math.max(0, Math.min(H - 1, Math.round(((maxP - p) / range) * (H - 1))));

  // grid: plain chars, colors applied at render time
  const grid = Array.from({ length: H }, () => new Array(W).fill(' '));

  for (let x = 0; x < W; x++) {
    for (const [key, ch] of [['s200', 'Y'], ['s50', 'C'], ['s20', 'M']]) {
      if (cols[x][key]) {
        const r = toRow(cols[x][key]);
        if (r >= 0 && r < H && grid[r][x] === ' ') grid[r][x] = ch;
      }
    }
    const r = toRow(cols[x].close);
    for (let row = r + 1; row < H; row++) {
      if (grid[row][x] === ' ') grid[row][x] = '.';
    }
    grid[r][x] = '●';
  }

  const LW = 8;
  const priceStep = range / (H - 1);
  const lines = [];

  for (let r = 0; r < H; r++) {
    const price = maxP - r * priceStep;
    const label = (r % 3 === 0 ? '$' + fmtPrice(price) : '').padStart(LW);
    let row = '';
    for (let x = 0; x < W; x++) {
      const ch = grid[r][x];
      if (ch === '●') row += chalk.blue('●');
      else if (ch === '.') row += chalk.dim('·');
      else if (ch === 'M') row += chalk.magenta('─');
      else if (ch === 'C') row += chalk.cyan('─');
      else if (ch === 'Y') row += chalk.yellow('─');
      else row += ' ';
    }
    lines.push(chalk.dim(label) + ' │' + row);
  }

  lines.push(' '.repeat(LW) + ' └' + '─'.repeat(W));
  const d0 = history[0].date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const d1 = history[Math.floor(n / 2)].date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const d2 = history.at(-1).date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const half = Math.floor(W / 2);
  lines.push(' '.repeat(LW + 2) + d0.padEnd(half) + d1.padEnd(Math.floor(W / 4)) + d2);
  return lines.join('\n');
}

function fmtPrice(n) {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

// ── Formatting ────────────────────────────────────────────────────────────────

const fmt2 = n => n?.toFixed(2) ?? 'N/A';
const fmtPct = n => n == null ? 'N/A' : n >= 0 ? chalk.green(`+${n.toFixed(2)}%`) : chalk.red(`${n.toFixed(2)}%`);
const h1 = s => chalk.bold.cyan(s);
const stars = n => chalk.yellow('★'.repeat(Math.max(0, n))) + chalk.dim('☆'.repeat(Math.max(0, 5 - n)));
const rsiBar = v => {
  const n = Math.round(v / 5);
  return chalk.green('▓'.repeat(n)) + chalk.dim('░'.repeat(20 - n));
};
const pctOf = (a, b) => b ? (a - b) / b * 100 : null;
const arrow = v => v > 0 ? chalk.green('↑ ABOVE') : chalk.red('↓ BELOW');

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Fetching data for ${symbol}...`);
const [quote, history] = await Promise.all([getQuote(symbol), getHistoryFull(symbol)]);

if (!history.length) { console.error(`No historical data for ${symbol}`); process.exit(1); }

const closes = history.map(d => d.close);
const last = closes.at(-1);
const change = quote.regularMarketChangePercent;

const s20 = smaArr(closes, 20);
const s50 = smaArr(closes, 50);
const s200 = smaArr(closes, 200);
const e12 = emaArr(closes, 12);
const e26 = emaArr(closes, 26);
const macdLine = e12.map((v, i) => v != null && e26[i] != null ? v - e26[i] : null);
const macdSig = emaArr(macdLine, 9);
const rsi14a = rsiArr(closes);

const sma20 = s20.at(-1);
const sma50 = s50.at(-1);
const sma200 = s200.at(-1);
const ema12 = e12.at(-1);
const ema26 = e26.at(-1);
const macd = macdLine.at(-1);
const macdSignal = macdSig.at(-1);
const macdHist = macd != null && macdSignal != null ? macd - macdSignal : null;
const rsi14 = rsi14a.at(-1);
const bb = bollingerBands(closes);
const atr14 = calcATR(history);
const stoch = calcStoch(history);
const pivots = calcPivots(history);

const high52w = Math.max(...closes);
const low52w = Math.min(...closes);
const trendBull = sma20 && sma50 && sma200 && last > sma20 && sma20 > sma50 && sma50 > sma200;
const trendBear = sma20 && sma50 && sma200 && last < sma20 && sma20 < sma50 && sma50 < sma200;

const rsiLabel = rsi14 >= 80 ? 'EXTREME OVERBOUGHT' : rsi14 >= 70 ? 'OVERBOUGHT'
  : rsi14 <= 20 ? 'EXTREME OVERSOLD' : rsi14 <= 30 ? 'OVERSOLD' : 'NEUTRAL';

const recentVol = history.at(-1).volume ?? 0;
const avgVol = history.slice(-20).reduce((s, d) => s + (d.volume ?? 0), 0) / 20;
const volRatio = avgVol > 0 ? recentVol / avgVol : null;

// ── Print ─────────────────────────────────────────────────────────────────────

console.log();
console.log(chalk.bold.white(`═══ ${quote.longName ?? symbol} (${symbol}) — Technical Analysis`));
console.log();

const chgC = change >= 0 ? chalk.green : chalk.red;
const trendLabel = trendBull ? chalk.green('STRONG BULLISH') : trendBear ? chalk.red('STRONG BEARISH') : chalk.yellow('MIXED');
console.log(`  ${chalk.bold.white('$' + fmt2(last))} ${chgC((change >= 0 ? '+' : '') + fmt2(change) + '%')}   RSI: ${chalk.bold(fmt2(rsi14))} [${rsi14 >= 70 ? chalk.red(rsiLabel) : rsi14 <= 30 ? chalk.green(rsiLabel) : chalk.yellow(rsiLabel)}]   Trend: ${trendLabel}`);
console.log();

if (showChart) {
  console.log(h1('  ── 52-WEEK PRICE CHART ──────────────────────────────────────────────'));
  console.log(chalk.dim('  Legend: ● Price  ─ SMA20(magenta) SMA50(cyan) SMA200(yellow)'));
  console.log();
  buildChart(history, s20, s50, s200).split('\n').forEach(l => console.log('  ' + l));
  console.log();
}

console.log(h1('  ── MOVING AVERAGES ─────────────────────────────────────────────────'));
const p20 = pctOf(last, sma20), p50 = pctOf(last, sma50), p200 = pctOf(last, sma200);
console.log(`  SMA 20:   $${fmt2(sma20)}    vs Price: ${fmtPct(p20)}  ${arrow(p20)}`);
console.log(`  SMA 50:   $${fmt2(sma50)}    vs Price: ${fmtPct(p50)}  ${arrow(p50)}`);
console.log(`  SMA 200:  $${fmt2(sma200)}    vs Price: ${fmtPct(p200)}  ${arrow(p200)}`);
console.log(`  EMA 12:   $${fmt2(ema12)}    EMA 26: $${fmt2(ema26)}`);
console.log(`  Alignment: ${trendBull ? chalk.green('ALL BULLISH ▲▲▲') : trendBear ? chalk.red('ALL BEARISH ▼▼▼') : chalk.yellow('MIXED — no clean stack')}`);
console.log();

console.log(h1('  ── MOMENTUM ─────────────────────────────────────────────────────────'));
const rsiC = rsi14 >= 70 ? chalk.red : rsi14 <= 30 ? chalk.green : chalk.yellow;
console.log(`  RSI (14):  ${rsiC(fmt2(rsi14))}   ${rsiBar(rsi14)}  ${rsiC(rsiLabel)}`);
if (rsi14 <= 20) console.log(chalk.green('             ⚠  EXTREME OVERSOLD — elevated mean-reversion probability'));
if (rsi14 >= 80) console.log(chalk.red('             ⚠  EXTREME OVERBOUGHT — elevated pullback risk'));
if (macd != null) {
  const histStr = macdHist >= 0 ? chalk.green(`+${fmt2(macdHist)}`) : chalk.red(fmt2(macdHist));
  console.log(`  MACD:      ${fmt2(macd)}   Signal: ${fmt2(macdSignal)}   Hist: ${histStr} → ${macdHist > 0 ? chalk.green('BULLISH') : chalk.red('BEARISH')}`);
}
if (stoch) {
  const sk = stoch.k;
  const skLabel = sk >= 80 ? chalk.red('OVERBOUGHT') : sk <= 20 ? chalk.green('OVERSOLD')
    : sk >= 70 ? chalk.yellow('APPROACHING OB') : sk <= 30 ? chalk.yellow('APPROACHING OS') : chalk.dim('NEUTRAL');
  console.log(`  Stoch %K:  ${fmt2(sk)}   %D: ${fmt2(stoch.d)}   → ${skLabel}`);
}
console.log();

console.log(h1('  ── VOLATILITY ───────────────────────────────────────────────────────'));
if (bb) {
  const bbPct = (last - bb.lower) / (bb.upper - bb.lower);
  console.log(`  Bollinger Bands (20,2):`);
  console.log(`    Upper: $${fmt2(bb.upper)}   (${fmtPct(pctOf(bb.upper, last))} from price)`);
  console.log(`    Mid:   $${fmt2(bb.middle)}`);
  console.log(`    Lower: $${fmt2(bb.lower)}   (${fmtPct(pctOf(bb.lower, last))} from price)`);
  console.log(`  %B: ${fmt2(bbPct)}  → Price in ${bbPct > 0.5 ? chalk.green('upper') : chalk.red('lower')} half of band`);
}
if (atr14 != null) {
  const atrPct = (atr14 / last) * 100;
  const atrLabel = atrPct > 5 ? chalk.red('HIGH') : atrPct > 3 ? chalk.yellow('MODERATE') : chalk.green('LOW');
  console.log(`  ATR (14):  $${fmt2(atr14)} (${atrPct.toFixed(1)}% of price) → ${atrLabel} volatility`);
}
console.log();

if (pivots) {
  console.log(h1('  ── SUPPORT / RESISTANCE ─────────────────────────────────────────────'));
  console.log(`  R2: $${fmt2(pivots.r2)}   R1: $${fmt2(pivots.r1)}`);
  console.log(`  Pivot: $${fmt2(pivots.pivot)}`);
  console.log(`  S1: $${fmt2(pivots.s1)}   S2: $${fmt2(pivots.s2)}`);
  const fromHigh = ((last - high52w) / high52w * 100).toFixed(2);
  const fromLow = ((last - low52w) / low52w * 100).toFixed(2);
  console.log(`  52w Range: $${fmt2(low52w)} – $${fmt2(high52w)}`);
  console.log(`  From 52w High: ${chalk.red(fromHigh + '%')}   From 52w Low: ${chalk.green('+' + fromLow + '%')}`);
  console.log();
}

console.log(h1('  ── VOLUME ───────────────────────────────────────────────────────────'));
if (volRatio != null) {
  const vLabel = volRatio > 1.5 ? chalk.green('VERY HIGH — strong conviction')
    : volRatio > 1.1 ? chalk.green('ABOVE AVERAGE — confirms price')
    : volRatio < 0.7 ? chalk.red('LOW — weak conviction') : chalk.yellow('AVERAGE');
  console.log(`  Today: ${(recentVol / 1e6).toFixed(1)}M    20d avg: ${(avgVol / 1e6).toFixed(1)}M    ${fmtPct((volRatio - 1) * 100)} vs avg`);
  console.log(`  Signal: ${vLabel}`);
}
console.log();

console.log(h1('  ── SIGNALS SUMMARY ──────────────────────────────────────────────────'));
const trendScore = trendBull ? 5 : trendBear ? 1 : last > (sma50 ?? 0) ? 3 : 2;
const momRaw = (rsi14 > 55 ? 1 : rsi14 < 45 ? -1 : 0)
  + (macdHist > 0 ? 1 : macdHist < 0 ? -1 : 0)
  + (stoch?.k > 50 ? 1 : stoch?.k < 50 ? -1 : 0);
const momScore = Math.max(1, Math.min(5, momRaw + 3));
const volScore = atr14 ? (atr14 / last < 0.025 ? 4 : atr14 / last < 0.04 ? 3 : 2) : 3;
const volumeScore = volRatio > 1.3 ? 4 : volRatio < 0.7 ? 2 : 3;

console.log(`  Trend:      ${stars(trendScore)}  ${trendBull ? chalk.green('BULLISH') : trendBear ? chalk.red('BEARISH') : chalk.yellow('MIXED')}`);
console.log(`  Momentum:   ${stars(momScore)}  ${momScore >= 4 ? chalk.green('BUILDING') : momScore <= 2 ? chalk.red('FADING') : chalk.yellow('NEUTRAL')}`);
console.log(`  Volatility: ${stars(volScore)}  ${volScore >= 4 ? chalk.green('LOW (tight)') : volScore === 3 ? chalk.yellow('MODERATE') : chalk.red('HIGH (wide swings)')}`);
console.log(`  Volume:     ${stars(volumeScore)}  ${volumeScore >= 4 ? chalk.green('CONFIRMING') : volumeScore <= 2 ? chalk.red('WEAK') : chalk.yellow('NEUTRAL')}`);
console.log();

const composite = trendScore + momScore + volumeScore;
const rating = composite >= 11 ? 'BULLISH' : composite <= 7 ? 'BEARISH' : 'NEUTRAL';
const ratingC = rating === 'BULLISH' ? chalk.green : rating === 'BEARISH' ? chalk.red : chalk.yellow;
const entry = sma20 ? `$${fmt2(sma20 * 0.99)}–$${fmt2(sma20 * 1.01)} (SMA20 zone)` : 'N/A';
const stop = sma50 ? `$${fmt2(sma50 * 0.97)} (below SMA50)` : 'N/A';

console.log(`  OVERALL:  ${ratingC(chalk.bold(rating))}`);
console.log(`  Entry:    ${entry}`);
console.log(`  Stop:     ${stop}`);
console.log();
