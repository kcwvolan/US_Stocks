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
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((v, i) => v - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = recent.filter(c => c < 0).map(Math.abs).reduce((a, b) => a + b, 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
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

function formatLarge(n) {
  if (!n) return 'N/A';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toString();
}
