// Pure options computation — no rendering, no side effects

export function dte(unix) {
  return Math.round((unix * 1000 - Date.now()) / 86400000);
}

function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function findATM(strikes, price) {
  return strikes.reduce((a, b) => Math.abs(a - price) <= Math.abs(b - price) ? a : b);
}

// Returns { price, source } — source is 'mid' | 'last' | 'ask/2' | null.
// Never returns price=0; callers that just need the number use optPrice().
// Handles bid/lastPrice/ask being null or undefined via ?? 0.
export function optPriceDetail(o) {
  if (!o) return { price: null, source: null };
  if ((o.bid ?? 0) > 0 && (o.ask ?? 0) > 0) return { price: (o.bid + o.ask) / 2, source: 'mid' };
  if ((o.lastPrice ?? 0) > 0) return { price: o.lastPrice, source: 'last' };
  if ((o.ask ?? 0) > 0) return { price: o.ask / 2, source: 'ask/2' };
  return { price: null, source: null };
}

export function optPrice(o) {
  return optPriceDetail(o).price;
}

function straddlePrice(chain, atmStrike) {
  const c = chain.calls.find(o => o.strike === atmStrike);
  const p = chain.puts.find(o => o.strike === atmStrike);
  if (!c || !p) return null;
  return (optPrice(c) ?? 0) + (optPrice(p) ?? 0);
}

function putCallRatio(chain) {
  const cOI = chain.calls.reduce((s, o) => s + (o.openInterest ?? 0), 0);
  const pOI = chain.puts.reduce((s, o) => s + (o.openInterest ?? 0), 0);
  return cOI > 0 ? pOI / cOI : null;
}

function maxPain(chain) {
  const strikes = [...new Set([
    ...chain.calls.map(o => o.strike),
    ...chain.puts.map(o => o.strike),
  ])].sort((a, b) => a - b);
  let minPain = Infinity, best = null;
  for (const sp of strikes) {
    let pain = 0;
    for (const o of chain.calls) pain += Math.max(0, sp - o.strike) * (o.openInterest ?? 0);
    for (const o of chain.puts) pain += Math.max(0, o.strike - sp) * (o.openInterest ?? 0);
    if (pain < minPain) { minPain = pain; best = sp; }
  }
  return best;
}

// IV=0 is indistinguishable from missing data; treat as null per CLAUDE.md rule.
const ivOrNull = v => (v == null || v === 0) ? null : v;

function atmIV(chain, atmStrike) {
  return ivOrNull(chain.calls.find(o => o.strike === atmStrike)?.impliedVolatility)
    ?? ivOrNull(chain.puts.find(o => o.strike === atmStrike)?.impliedVolatility)
    ?? null;
}

// Fraction of contracts in a chain that have no usable bid (bid == 0 or null).
function missingBidRate(chain) {
  const contracts = [...chain.calls, ...chain.puts];
  if (!contracts.length) return 0;
  return contracts.filter(o => !((o.bid ?? 0) > 0)).length / contracts.length;
}

export function computeOptions(quote, optData, calendar, { dteFloor = 7, dteMax = 90 } = {}) {
  if (!optData?.options?.length) return null;

  const price = quote.regularMarketPrice;
  const { strikes } = optData;

  // Strict DTE filter: exclude chains outside [dteFloor, dteMax]
  const chains = optData.options.filter(ch => {
    const d = dte(ch.expirationDate);
    return d >= dteFloor && d <= dteMax;
  });
  if (!chains.length) return null;

  let earningsTs = null;
  try {
    const raw = calendar?.calendarEvents?.earnings?.earningsDate?.[0];
    if (raw) earningsTs = typeof raw === 'object' ? raw.raw : raw;
  } catch {}

  const chain1 = chains[0];
  const dte1 = dte(chain1.expirationDate);
  const expiry1 = fmtDate(chain1.expirationDate);

  const bidRate = missingBidRate(chain1);
  const missingBidWarning = bidRate > 0.20
    ? `${(bidRate * 100).toFixed(0)}% of contracts have no bid — premiums fall back to lastPrice or ask/2`
    : null;

  const atm = findATM(strikes, price);
  const straddle = straddlePrice(chain1, atm);
  const straddlePct = straddle ? (straddle / price) * 100 : null;
  const iv1 = atmIV(chain1, atm);
  const pcr = putCallRatio(chain1);
  const mp = maxPain(chain1);

  const atmIdx = strikes.indexOf(atm);
  const nearStrikes = strikes.slice(Math.max(0, atmIdx - 3), atmIdx + 4);

  const daysToEarnings = earningsTs ? dte(earningsTs) : null;
  const earningsNear = daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 35;
  const highIV = iv1 != null && iv1 > 0.45;

  const chainRows = nearStrikes.map(strike => {
    const c = chain1.calls.find(o => o.strike === strike);
    const p = chain1.puts.find(o => o.strike === strike);
    const cd = optPriceDetail(c);
    const pd = optPriceDetail(p);
    return {
      strike, isATM: strike === atm,
      callPrice: cd.price, callSource: cd.source,
      callIV: ivOrNull(c?.impliedVolatility),
      putPrice: pd.price, putSource: pd.source,
      putIV: ivOrNull(p?.impliedVolatility),
    };
  });

  const wingW = Math.max(5, Math.round(price * 0.05 / 5) * 5);
  const sellC = nearStrikes.find(s => s >= price * 1.04) ?? atm + wingW;
  const buyC = sellC + wingW;
  const sellP = nearStrikes.findLast?.(s => s <= price * 0.96)
    ?? nearStrikes.slice().reverse().find(s => s < price * 0.96)
    ?? atm - wingW;
  const buyP = sellP - wingW;

  let strategy;
  if (earningsNear && highIV) {
    strategy = {
      name: 'IRON CONDOR',
      legs: `Sell ${sellC} Call / Buy ${buyC} Call / Sell ${sellP} Put / Buy ${buyP} Put`,
      rationale: 'Sell IV premium before earnings crush; wings cap max loss',
    };
  } else if (earningsNear) {
    strategy = {
      name: 'LONG STRADDLE',
      legs: `Buy $${atm} Call + Buy $${atm} Put`,
      rationale: straddle
        ? `Low IV → cheap convexity. Cost ~$${straddle.toFixed(2)} (±${straddlePct.toFixed(1)}%). Break-even: $${(price - straddle).toFixed(2)} / $${(price + straddle).toFixed(2)}`
        : 'Earnings binary event with affordable IV',
    };
  } else if (highIV) {
    strategy = {
      name: 'COVERED CALL / CSP',
      legs: `Sell $${sellC} Call (covered) or $${sellP} Put (cash-secured)`,
      rationale: 'Elevated IV with no near-term catalyst → premium selling edge',
    };
  } else {
    strategy = {
      name: 'BULL CALL SPREAD',
      legs: `Buy $${atm} Call + Sell $${sellC} Call`,
      rationale: 'Defined risk in normal IV environment; limits premium outlay',
    };
  }

  const ivEnv = iv1 == null ? 'N/A'
    : iv1 > 0.7 ? 'VERY HIGH' : iv1 > 0.45 ? 'HIGH'
    : iv1 > 0.25 ? 'MODERATE' : 'LOW';

  return {
    price, dte1, expiry1, atm,
    missingBidWarning,
    straddle, straddlePct, iv1, ivEnv,
    pcr, mp, chainRows,
    earningsTs, daysToEarnings, earningsNear, highIV,
    strategy,
  };
}
