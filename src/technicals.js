// Pure TA computation — no rendering, no side effects

export function smaArr(arr, period) {
  const res = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    if (i >= period - 1) res[i] = sum / period;
  }
  return res;
}

export function emaArr(arr, period) {
  const k = 2 / (period + 1);
  const res = new Array(arr.length).fill(null);
  const start = arr.findIndex(v => v != null);
  if (start < 0 || arr.length - start < period) return res;
  let val = arr.slice(start, start + period).reduce((a, b) => a + b, 0) / period;
  res[start + period - 1] = val;
  for (let i = start + period; i < arr.length; i++) {
    if (arr[i] != null) val = arr[i] * k + val * (1 - k);
    res[i] = val;
  }
  return res;
}

// Wilder smoothing (TradingView / TA-Lib convention). A flat series returns 50 so it is not read as oversold.
export function rsiArr(closes, period = 14) {
  const res = new Array(closes.length).fill(null);
  if (closes.length <= period) return res;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const toRsi = () => (gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  res[period] = toRsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    res[i] = toRsi();
  }
  return res;
}

export function bollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  return { upper: mean + 2 * Math.sqrt(variance), middle: mean, lower: mean - 2 * Math.sqrt(variance) };
}

export function calcATR(history, period = 14) {
  const trs = [];
  for (let i = 1; i < history.length; i++) {
    const { high, low } = history[i];
    const prev = history[i - 1].close;
    if (high == null || low == null) continue;
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)));
  }
  if (trs.length < period) return null;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function calcStoch(history, kPeriod = 14, dPeriod = 3) {
  if (history.length < kPeriod) return null;
  const ks = [];
  for (let i = kPeriod - 1; i < history.length; i++) {
    const s = history.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...s.map(d => d.high ?? d.close));
    const low = Math.min(...s.map(d => d.low ?? d.close));
    const close = history[i].close;
    ks.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }
  const k = ks.at(-1);
  const d = ks.length >= dPeriod ? ks.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod : null;
  return { k, d };
}

export function calcPivots(history) {
  if (history.length < 2) return null;
  const p = history.at(-2);
  const hi = p.high ?? p.close;
  const lo = p.low ?? p.close;
  const pivot = (hi + lo + p.close) / 3;
  const hl = hi - lo;
  return { r2: pivot + hl, r1: 2 * pivot - lo, pivot, s1: 2 * pivot - hi, s2: pivot - hl };
}

export function computeTechnicals(quote, history) {
  const closes = history.map(d => d.close);
  const last = closes.at(-1);

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
  const fromHigh = ((last - high52w) / high52w * 100);
  const fromLow = ((last - low52w) / low52w * 100);

  const recentVol = history.at(-1)?.volume ?? 0;
  const avgVol = history.slice(-20).reduce((s, d) => s + (d.volume ?? 0), 0) / 20;
  const volRatio = avgVol > 0 ? recentVol / avgVol : null;

  const trendBull = sma20 && sma50 && sma200 && last > sma20 && sma20 > sma50 && sma50 > sma200;
  const trendBear = sma20 && sma50 && sma200 && last < sma20 && sma20 < sma50 && sma50 < sma200;

  const rsiLabel = rsi14 >= 80 ? 'EXTREME OVERBOUGHT' : rsi14 >= 70 ? 'OVERBOUGHT'
    : rsi14 <= 20 ? 'EXTREME OVERSOLD' : rsi14 <= 30 ? 'OVERSOLD' : 'NEUTRAL';

  const trendScore = trendBull ? 5 : trendBear ? 1 : last > (sma50 ?? 0) ? 3 : 2;
  const momRaw = (rsi14 > 55 ? 1 : rsi14 < 45 ? -1 : 0)
    + (macdHist > 0 ? 1 : macdHist < 0 ? -1 : 0)
    + (stoch?.k > 50 ? 1 : stoch?.k < 50 ? -1 : 0);
  const momScore = Math.max(1, Math.min(5, momRaw + 3));
  const volScore = atr14 ? (atr14 / last < 0.025 ? 4 : atr14 / last < 0.04 ? 3 : 2) : 3;
  const volumeScore = volRatio > 1.3 ? 4 : volRatio < 0.7 ? 2 : 3;
  const composite = trendScore + momScore + volumeScore;
  const rating = composite >= 11 ? 'BULLISH' : composite <= 7 ? 'BEARISH' : 'NEUTRAL';

  const f = n => n?.toFixed(2) ?? 'N/A';
  const entry = sma20 ? `$${f(sma20 * 0.99)}–$${f(sma20 * 1.01)} (SMA20 zone)` : 'N/A';
  const stop = sma50 ? `$${f(sma50 * 0.97)} (below SMA50)` : 'N/A';

  return {
    price: last, change: quote.regularMarketChangePercent,
    sma20, sma50, sma200, ema12, ema26,
    macd, macdSignal, macdHist, rsi14, rsiLabel,
    bb, atr14, stoch, pivots,
    high52w, low52w, fromHigh, fromLow,
    recentVol, avgVol, volRatio,
    trendBull, trendBear, rating,
    trendScore, momScore, volScore, volumeScore,
    entry, stop,
  };
}
