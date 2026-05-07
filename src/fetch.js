const BASE1 = 'https://query1.finance.yahoo.com';
const BASE2 = 'https://query2.finance.yahoo.com';

let _session = null;

async function getSession() {
  if (_session) return _session;

  // Step 1: get cookies
  const cookieRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });
  const cookies = (cookieRes.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0])
    .join('; ');

  // Step 2: get crumb
  const crumbRes = await fetch(`${BASE1}/v1/test/getcrumb`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookies },
  });
  const crumb = await crumbRes.text();
  _session = { cookies, crumb };
  return _session;
}

async function yf(url, useSession = false) {
  let headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
  let finalUrl = url;

  if (useSession) {
    const { cookies, crumb } = await getSession();
    headers.Cookie = cookies;
    finalUrl += (url.includes('?') ? '&' : '?') + `crumb=${encodeURIComponent(crumb)}`;
  }

  const res = await fetch(finalUrl, { headers });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} — ${finalUrl}`);
  return res.json();
}

export async function getQuote(symbol) {
  const data = await yf(`${BASE1}/v8/finance/chart/${symbol}?interval=1d&range=5d`);
  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  const change = price && prev ? ((price - prev) / prev) * 100 : null;

  // marketCap not in chart meta — derive from summary if available, else null
  return {
    symbol: meta.symbol,
    longName: meta.longName ?? meta.shortName ?? symbol,
    shortName: meta.shortName ?? symbol,
    regularMarketPrice: price,
    previousClose: prev,
    regularMarketChangePercent: change,
    marketCap: meta.marketCap ?? null,
    sharesOutstanding: meta.sharesOutstanding ?? null,
  };
}

export async function getSummary(symbol) {
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistory';
  const data = await yf(
    `${BASE1}/v10/finance/quoteSummary/${symbol}?modules=${modules}`,
    true
  );
  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error(`No summary data for ${symbol}`);
  return result;
}

export async function getHistory(symbol) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 365 * 24 * 3600;
  const data = await yf(
    `${BASE1}/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`
  );
  const r = data.chart.result[0];
  const timestamps = r.timestamp ?? [];
  const closes = r.indicators.quote[0].close ?? [];
  return timestamps
    .map((t, i) => ({ date: new Date(t * 1000), close: closes[i] }))
    .filter(d => d.close != null);
}
