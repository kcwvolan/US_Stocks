import { rsiArr } from './technicals.js';

function raw(val) {
  if (val == null) return null;
  return typeof val === 'object' && 'raw' in val ? val.raw : val;
}

export function fundamentals(summary, quote) {
  const sd = summary.summaryDetail ?? {};
  const ks = summary.defaultKeyStatistics ?? {};
  const fd = summary.financialData ?? {};

  return {
    symbol: quote.symbol,
    name: quote.longName ?? quote.shortName,
    price: quote.regularMarketPrice,
    change1d: quote.regularMarketChangePercent?.toFixed(2),
    marketCap: formatLarge(
      quote.marketCap ?? (raw(ks.sharesOutstanding) && quote.regularMarketPrice
        ? raw(ks.sharesOutstanding) * quote.regularMarketPrice
        : null)
    ),
    pe: num(raw(sd.trailingPE), 2),
    forwardPE: num(raw(sd.forwardPE), 2),
    eps: num(raw(ks.trailingEps), 2),
    pbRatio: num(raw(ks.priceToBook), 2),
    roe: pct(raw(fd.returnOnEquity)),
    revenueGrowth: pct(raw(fd.revenueGrowth)),
    grossMargin: pct(raw(fd.grossMargins)),
    operatingMargin: pct(raw(fd.operatingMargins)),
    debtToEquity: num(raw(fd.debtToEquity), 2),
    currentRatio: num(raw(fd.currentRatio), 2),
    targetPrice: num(raw(fd.targetMeanPrice), 2),
    recommendation: fd.recommendationKey ?? 'N/A',
  };
}

export function technicals(history) {
  if (!history.length) return null;
  const closes = history.map(d => d.close);
  const last = closes.at(-1);
  return {
    sma20: sma(closes, 20)?.toFixed(2) ?? null,
    sma50: sma(closes, 50)?.toFixed(2) ?? null,
    sma200: sma(closes, 200)?.toFixed(2) ?? null,
    rsi14: rsi(closes, 14)?.toFixed(2) ?? null,
    high52w: Math.max(...closes).toFixed(2),
    low52w: Math.min(...closes).toFixed(2),
    fromHigh52w: (((last - Math.max(...closes)) / Math.max(...closes)) * 100).toFixed(2),
  };
}

function sma(arr, n) {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function rsi(closes, period = 14) {
  return rsiArr(closes, period).at(-1) ?? null;
}

function num(val, dec = 2) {
  if (val == null) return 'N/A';
  const n = Number(val);
  return isNaN(n) ? 'N/A' : n.toFixed(dec);
}

function pct(val) {
  if (val == null) return 'N/A';
  const n = Number(val);
  return isNaN(n) ? 'N/A' : (n * 100).toFixed(2) + '%';
}

export function valuationAnalysis(fund) {
  const price = parseFloat(fund.price) || 0;
  const eps = parseFloat(fund.eps);
  const pb = parseFloat(fund.pbRatio);
  const targetPrice = parseFloat(fund.targetPrice);

  let peScenarios = null;
  if (!isNaN(eps) && eps > 0) {
    peScenarios = {
      bear: +(eps * 15).toFixed(2),
      base: +(eps * 25).toFixed(2),
      bull: +(eps * 40).toFixed(2),
    };
  }

  let pbScenarios = null;
  if (!isNaN(pb) && pb > 0 && price > 0) {
    const book = +(price / pb).toFixed(2);
    pbScenarios = {
      bear: +(book * 1.5).toFixed(2),
      base: +(book * 2.5).toFixed(2),
      bull: +(book * 4.0).toFixed(2),
    };
  }

  const upside = (!isNaN(targetPrice) && targetPrice > 0 && price > 0)
    ? +(((targetPrice - price) / price) * 100).toFixed(1)
    : null;

  return { peScenarios, pbScenarios, upside, targetPrice: isNaN(targetPrice) ? null : targetPrice };
}

export function signalBlock(fund, tech) {
  let score = 0;
  const signals = [];
  const price = parseFloat(fund.price);

  if (tech) {
    const sma20 = parseFloat(tech.sma20);
    const sma50 = parseFloat(tech.sma50);
    const sma200 = parseFloat(tech.sma200);
    const rsi = parseFloat(tech.rsi14);
    const fromHigh = parseFloat(tech.fromHigh52w);

    if (!isNaN(sma20)) {
      if (price > sma20) { score += 1; signals.push({ label: 'Above SMA20', verdict: 'bullish' }); }
      else { score -= 1; signals.push({ label: 'Below SMA20', verdict: 'bearish' }); }
    }
    if (!isNaN(sma50)) {
      if (price > sma50) { score += 1; signals.push({ label: 'Above SMA50', verdict: 'bullish' }); }
      else { score -= 1; signals.push({ label: 'Below SMA50', verdict: 'bearish' }); }
    }
    if (!isNaN(sma200)) {
      if (price > sma200) { score += 1; signals.push({ label: 'Above SMA200', verdict: 'bullish' }); }
      else { score -= 1; signals.push({ label: 'Below SMA200', verdict: 'bearish' }); }
    }
    if (!isNaN(rsi)) {
      if (rsi < 30) { score += 1; signals.push({ label: `RSI ${rsi} — Oversold`, verdict: 'bullish' }); }
      else if (rsi > 70) { score -= 1; signals.push({ label: `RSI ${rsi} — Overbought`, verdict: 'bearish' }); }
      else { signals.push({ label: `RSI ${rsi} — Neutral`, verdict: 'neutral' }); }
    }
    if (!isNaN(fromHigh) && fromHigh < -30) {
      score += 0.5;
      signals.push({ label: `${fromHigh}% from 52w High`, verdict: 'bullish' });
    }
  }

  const recKey = (fund.recommendation ?? '').toLowerCase();
  if (recKey === 'strong_buy' || recKey === 'strongbuy') { score += 2; signals.push({ label: 'Analyst: Strong Buy', verdict: 'bullish' }); }
  else if (recKey === 'buy') { score += 1; signals.push({ label: 'Analyst: Buy', verdict: 'bullish' }); }
  else if (recKey === 'hold') { signals.push({ label: 'Analyst: Hold', verdict: 'neutral' }); }
  else if (recKey === 'sell' || recKey === 'strong_sell') { score -= 2; signals.push({ label: 'Analyst: Sell', verdict: 'bearish' }); }

  const revGrowth = parseFloat(fund.revenueGrowth);
  if (!isNaN(revGrowth)) {
    if (revGrowth > 20) { score += 1; signals.push({ label: `Revenue Growth ${fund.revenueGrowth}`, verdict: 'bullish' }); }
    else if (revGrowth < 0) { score -= 1; signals.push({ label: `Revenue Declining ${fund.revenueGrowth}`, verdict: 'bearish' }); }
  }

  const grossM = parseFloat(fund.grossMargin);
  if (!isNaN(grossM) && grossM > 40) {
    score += 1;
    signals.push({ label: `Gross Margin ${fund.grossMargin}`, verdict: 'bullish' });
  }

  const de = parseFloat(fund.debtToEquity);
  if (!isNaN(de)) {
    if (de > 100) { score -= 1; signals.push({ label: `High D/E ${fund.debtToEquity}`, verdict: 'bearish' }); }
    else if (de < 50) { score += 0.5; signals.push({ label: `Low D/E ${fund.debtToEquity}`, verdict: 'bullish' }); }
  }

  const cr = parseFloat(fund.currentRatio);
  if (!isNaN(cr)) {
    if (cr > 2) { score += 0.5; signals.push({ label: `Strong Current Ratio ${fund.currentRatio}`, verdict: 'bullish' }); }
    else if (cr < 1) { score -= 1; signals.push({ label: `Weak Current Ratio ${fund.currentRatio}`, verdict: 'bearish' }); }
  }

  let overall;
  if (score >= 5) overall = 'STRONG BUY';
  else if (score >= 2.5) overall = 'BUY';
  else if (score >= 0) overall = 'HOLD';
  else if (score >= -2) overall = 'SELL';
  else overall = 'STRONG SELL';

  return { score: +score.toFixed(1), signals, overall };
}

export function incomeHistory(summary) {
  const annual = summary.incomeStatementHistory?.incomeStatementHistory ?? [];
  return annual.slice(0, 4).map(s => {
    const v = val => (val == null ? null : typeof val === 'object' && 'raw' in val ? val.raw : val);
    return {
      date: s.endDate?.fmt ?? 'N/A',
      revenue: v(s.totalRevenue),
      grossProfit: v(s.grossProfit),
      netIncome: v(s.netIncome),
    };
  });
}

function formatLarge(n) {
  if (!n) return 'N/A';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toString();
}

export function convictionParts(sigs, ta, val, opts) {
  const signals = sigs?.score ?? 0;
  const tech = ta?.rating === 'BULLISH' ? 2 : ta?.rating === 'BEARISH' ? -2 : 0;
  const valuation = val?.upside > 25 ? 1 : val?.upside < -10 ? -1 : 0;
  const options = opts?.pcr == null ? 0 : opts.pcr < 0.6 ? 0.5 : opts.pcr > 1.5 ? -0.5 : 0;
  const total = +(signals + tech + valuation + options).toFixed(2);
  return { signals, tech, valuation, options, total };
}
