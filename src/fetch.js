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

export async function getHistoryFull(symbol) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 365 * 24 * 3600;
  const data = await yf(
    `${BASE1}/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`
  );
  const r = data.chart.result[0];
  const timestamps = r.timestamp ?? [];
  const q = r.indicators.quote[0];
  return timestamps
    .map((t, i) => ({
      date: new Date(t * 1000),
      open: q.open?.[i],
      high: q.high?.[i],
      low: q.low?.[i],
      close: q.close?.[i],
      volume: q.volume?.[i],
    }))
    .filter(d => d.close != null);
}

export async function getOptions(symbol, date = null) {
  const url = date
    ? `${BASE1}/v7/finance/options/${symbol}?date=${date}`
    : `${BASE1}/v7/finance/options/${symbol}`;
  const data = await yf(url, true);
  const result = data.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol}`);
  return result;
}

// Pure helper: given an expirationDates array, return the first timestamp whose
// DTE >= dteFloor, or null if none qualify. Exported for unit testing.
export function pickNextExpiry(expirationDates, dteFloor) {
  if (!expirationDates?.length) return null;
  return expirationDates.find(
    ts => Math.round((ts * 1000 - Date.now()) / 86400000) >= dteFloor
  ) ?? null;
}

// Fetches options, re-fetching with the next valid expiry if the default chain
// has DTE < dteFloor (near-expiry contracts collapse to $0 bids).
export async function getOptionsWithDteFloor(symbol, dteFloor = 7) {
  const data = await getOptions(symbol);
  if (!data?.options?.length) return data;
  const firstDte = Math.round((data.options[0].expirationDate * 1000 - Date.now()) / 86400000);
  if (firstDte >= dteFloor) return data;
  const nextDate = pickNextExpiry(data.expirationDates, dteFloor);
  return nextDate ? getOptions(symbol, nextDate) : data;
}

export async function getCalendar(symbol) {
  const data = await yf(
    `${BASE1}/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`,
    true
  );
  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error(`No calendar data for ${symbol}`);
  return result;
}

// ── Market Screener ───────────────────────────────────────────────────────────
// scrId: 'day_gainers' | 'day_losers' | 'most_actives' | 'small_cap_gainers'
export async function getScreener(scrId, count = 25) {
  const data = await yf(
    `${BASE1}/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=${count}&region=US&lang=en-US`,
    true
  );
  const quotes = data?.finance?.result?.[0]?.quotes ?? [];
  return quotes.map(q => ({
    symbol:        q.symbol,
    name:          q.shortName ?? q.longName ?? q.symbol,
    price:         q.regularMarketPrice,
    change:        q.regularMarketChange,
    changePct:     q.regularMarketChangePercent,
    volume:        q.regularMarketVolume,
    avgVolume:     q.averageDailyVolume3Month ?? q.averageDailyVolume10Day,
    marketCap:     q.marketCap,
    preMarketPct:  q.preMarketChangePercent ?? null,
    preMarketPrice:q.preMarketPrice ?? null,
    time:          q.regularMarketTime ?? null,
  }));
}

// ── Pre-market quote ──────────────────────────────────────────────────────────
export async function getPreMarket(symbol) {
  const data = await yf(
    `${BASE1}/v8/finance/chart/${symbol}?interval=1m&range=1d&prePost=true`
  );
  const meta = data.chart.result?.[0]?.meta;
  return {
    symbol,
    preMarketPrice:   meta?.preMarketPrice ?? null,
    preMarketChange:  meta?.preMarketChange ?? null,
    preMarketChangePct: meta?.preMarketChangePercent ?? null,
    regularMarketPrice: meta?.regularMarketPrice ?? null,
  };
}

// ── Market News ───────────────────────────────────────────────────────────────
export async function getMarketNews(count = 8) {
  const data = await yf(
    `${BASE2}/v2/finance/news?symbols=%5EGSPC,%5EIXIC,%5EDJI&count=${count}&region=US`
  );
  const items = data?.items?.result ?? [];
  return items.slice(0, count).map(n => ({
    title:     n.title ?? '',
    publisher: n.publisher ?? '',
    link:      n.link ?? '',
    pubDate:   n.pubTime ? new Date(n.pubTime * 1000).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }) : '',
  }));
}

// ── Per-symbol news (headlines only, not scored) ──────────────────────────────
export function parseNews(data, symbol, count = 3) {
  const sym = String(symbol).toUpperCase();
  return (data?.news ?? [])
    .filter(n => n?.title && (n.relatedTickers ?? []).map(String).includes(sym))
    .slice(0, count)
    .map(n => ({
      title: n.title,
      publisher: n.publisher ?? '',
      link: n.link ?? '',
      time: n.providerPublishTime ? new Date(n.providerPublishTime * 1000) : null,
    }));
}

export async function getNews(symbol, count = 3) {
  const data = await yf(`${BASE2}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=${count * 3}&quotesCount=0`);
  return parseNews(data, symbol, count);
}

// ── Sector / industry (assetProfile; ETFs and some micro caps return none) ────
export async function getProfile(symbol) {
  const data = await yf(`${BASE1}/v10/finance/quoteSummary/${symbol}?modules=assetProfile`, true);
  const p = data.quoteSummary?.result?.[0]?.assetProfile;
  return { sector: p?.sector ?? null, industry: p?.industry ?? null };
}
