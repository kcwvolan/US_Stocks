#!/usr/bin/env node
import { getQuote, getOptionsWithDteFloor, getCalendar } from '../src/fetch.js';
import { optPriceDetail, atmIV } from '../src/options.js';
import chalk from 'chalk';

const symbol = process.argv[2]?.toUpperCase();
const earningsFocus = process.argv.includes('--earnings');
const dteFlagIdx = process.argv.indexOf('--dte-floor');
const dteFloor = dteFlagIdx !== -1 ? parseInt(process.argv[dteFlagIdx + 1], 10) || 7 : 7;
const dteMaxFlagIdx = process.argv.indexOf('--dte-max');
const dteMax = dteMaxFlagIdx !== -1 ? parseInt(process.argv[dteMaxFlagIdx + 1], 10) || 90 : 90;

if (!symbol) {
  console.error('Usage: node scripts/options-analysis.js SYMBOL [--earnings]');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt2 = n => n != null ? n.toFixed(2) : 'N/A';
const h1 = s => chalk.bold.cyan(s);

function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function dte(unix) {
  return Math.round((unix * 1000 - Date.now()) / 86400000);
}

function findATM(strikes, price) {
  return strikes.reduce((a, b) => Math.abs(a - price) <= Math.abs(b - price) ? a : b);
}

// optPrice/optPriceDetail imported from src/options.js
const optPrice = o => optPriceDetail(o).price;

function straddle(chain, atmStrike) {
  const c = chain.calls.find(o => o.strike === atmStrike);
  const p = chain.puts.find(o => o.strike === atmStrike);
  if (!c || !p) return null;
  const cmid = optPrice(c) ?? 0;
  const pmid = optPrice(p) ?? 0;
  return cmid + pmid;
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

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Fetching options data for ${symbol}...`);

const [quote, optData] = await Promise.all([
  getQuote(symbol),
  getOptionsWithDteFloor(symbol, dteFloor).catch(e => { console.error(chalk.red(`Options unavailable: ${e.message}`)); return null; }),
]);

if (!optData?.options?.length) {
  console.log(chalk.yellow('No options chain available for this ticker.'));
  process.exit(0);
}

const price = quote.regularMarketPrice;
const change = quote.regularMarketChangePercent;
const { expirationDates, strikes } = optData;
let { options: chains } = optData;

// Strict DTE filter: drop chains outside [dteFloor, dteMax]
chains = chains.filter(ch => {
  const d = dte(ch.expirationDate);
  return d >= dteFloor && d <= dteMax;
});
if (!chains.length) {
  console.log(chalk.yellow(`No options chains available in DTE range [${dteFloor}–${dteMax}].`));
  process.exit(0);
}

// Earnings date (best-effort)
let earningsTs = null;
try {
  const cal = await getCalendar(symbol);
  const raw = cal?.calendarEvents?.earnings?.earningsDate?.[0];
  if (raw) earningsTs = typeof raw === 'object' ? raw.raw : raw;
} catch {}

const chain1 = chains[0];
const chain2 = chains[1] ?? null;

// Missing bid quality check: warn when > 20% of contracts lack a usable bid
const allContracts = [...chain1.calls, ...chain1.puts];
const missingBids = allContracts.filter(o => !((o.bid ?? 0) > 0)).length;
const missingBidPct = allContracts.length ? missingBids / allContracts.length : 0;

const dte1 = dte(chain1.expirationDate);
const dte2 = chain2 ? dte(chain2.expirationDate) : null;

const atm = findATM(strikes, price);
const expMove1 = straddle(chain1, atm);
const expMovePct1 = expMove1 ? (expMove1 / price) * 100 : null;
const iv1 = atmIV(chain1, atm);
const iv2 = chain2 ? atmIV(chain2, atm) : null;
const pcr = putCallRatio(chain1);
const mp = maxPain(chain1);

const atmIdx = strikes.indexOf(atm);
const nearStrikes = strikes.slice(Math.max(0, atmIdx - 3), atmIdx + 4);

const daysToEarnings = earningsTs ? dte(earningsTs) : null;
const earningsNear = daysToEarnings != null && daysToEarnings >= 0 && daysToEarnings <= 35;
const highIV = iv1 != null && iv1 > 0.45;

// ── Output ────────────────────────────────────────────────────────────────────

console.log();
console.log(chalk.bold.white(`═══ ${quote.longName ?? symbol} (${symbol}) — Options Analysis`));
console.log();

const chgC = change >= 0 ? chalk.green : chalk.red;
console.log(`  Underlying: ${chalk.bold.white('$' + fmt2(price))} ${chgC((change >= 0 ? '+' : '') + fmt2(change) + '%')}`);
if (earningsTs) {
  const earnStr = daysToEarnings >= 0
    ? `${fmtDate(earningsTs)} (${daysToEarnings} days away)`
    : `${fmtDate(earningsTs)} (${-daysToEarnings} days ago)`;
  console.log(`  Earnings:   ${chalk.yellow(earnStr)}`);
}
console.log();

if (missingBidPct > 0.20) {
  console.log(chalk.yellow(`  ⚠ Data quality: ${(missingBidPct * 100).toFixed(0)}% of contracts have no bid — premiums based on lastPrice or ask/2 fallbacks`));
  console.log();
}

console.log(h1('  ── IV ENVIRONMENT ───────────────────────────────────────────────────'));
if (iv1 != null) {
  const ivLabel = iv1 > 0.7 ? chalk.red('VERY HIGH') : iv1 > 0.45 ? chalk.red('HIGH')
    : iv1 > 0.25 ? chalk.yellow('MODERATE') : chalk.green('LOW');
  console.log(`  ATM IV (${dte1}d to exp):  ${chalk.bold((iv1 * 100).toFixed(1) + '%')} → ${ivLabel}`);
}
if (iv2 != null) {
  console.log(`  ATM IV (${dte2}d to exp):  ${(iv2 * 100).toFixed(1)}%`);
  if (iv1 != null) {
    const tsLabel = iv1 > iv2
      ? chalk.red('BACKWARDATION — elevated near-term risk (event priced in)')
      : chalk.green('CONTANGO — normal structure');
    console.log(`  Term Structure: ${tsLabel}`);
  }
}
console.log();

console.log(h1('  ── EXPECTED MOVE ────────────────────────────────────────────────────'));
if (expMove1) {
  console.log(`  ATM Straddle (${dte1}d):    $${fmt2(expMove1)}`);
  console.log(`  Expected Range: ${chalk.bold('$' + fmt2(price - expMove1) + ' – $' + fmt2(price + expMove1))} (±${fmt2(expMovePct1)}%)`);
}

if (earningsNear && expMove1) {
  // find the expiry chain nearest to earnings
  const earnExp = expirationDates.reduce((a, b) =>
    Math.abs(a - earningsTs) < Math.abs(b - earningsTs) ? a : b);
  const earnChain = chains.find(o => o.expirationDate === earnExp);
  if (earnChain) {
    const em = straddle(earnChain, atm);
    if (em) {
      const emPct = (em / price) * 100;
      console.log(`  Earnings Exp. Move: $${fmt2(em)} (±${emPct.toFixed(1)}%)`);
      console.log(`  Earnings Range:     $${fmt2(price - em)} – $${fmt2(price + em)}`);
    }
  }
}
console.log();

console.log(h1('  ── OPTIONS CHAIN (ATM ±3 strikes) ──────────────────────────────────'));
console.log(chalk.dim(`  Expiry: ${fmtDate(chain1.expirationDate)} (${dte1} days)`));
console.log();
console.log(chalk.dim('  Strike  │    CALL         │  Call IV  │    PUT          │  Put IV  │ OI Ratio'));
console.log(chalk.dim('  ────────┼─────────────────┼───────────┼─────────────────┼──────────┼─────────'));

for (const strike of nearStrikes) {
  const c = chain1.calls.find(o => o.strike === strike);
  const p = chain1.puts.find(o => o.strike === strike);
  const cd = optPriceDetail(c);
  const pd = optPriceDetail(p);
  const cb = cd.price != null ? `$${fmt2(cd.price)} (${cd.source})` : (c ? '  N/A   ' : '  N/A   ');
  const pb = pd.price != null ? `$${fmt2(pd.price)} (${pd.source})` : (p ? '  N/A   ' : '  N/A   ');
  const civ = c?.impliedVolatility > 0 ? (c.impliedVolatility * 100).toFixed(1) + '%' : ' N/A ';
  const piv = p?.impliedVolatility > 0 ? (p.impliedVolatility * 100).toFixed(1) + '%' : ' N/A ';
  const cOI = c?.openInterest ?? 0, pOI = p?.openInterest ?? 0;
  const oirStr = cOI > 0 ? (pOI / cOI).toFixed(1) + 'x' : 'N/A';
  const isATM = strike === atm;
  const row = `  ${String(strike).padStart(6)}  │ ${cb.padEnd(15)} │  ${civ.padEnd(8)} │ ${pb.padEnd(15)} │  ${piv.padEnd(8)} │ ${oirStr}`;
  console.log(isATM ? chalk.bold.white(row + ' ← ATM') : chalk.dim(row));
}
console.log();

if (pcr != null) {
  const pcrLabel = pcr > 1.3 ? chalk.red('BEARISH sentiment') : pcr < 0.7 ? chalk.green('BULLISH sentiment') : chalk.yellow('NEUTRAL');
  console.log(`  Put/Call Ratio (OI): ${fmt2(pcr)} → ${pcrLabel}`);
}
if (mp) console.log(`  Max Pain: $${mp} (price gravity at expiration)`);
console.log();

// ── Strategy Recommendations ──────────────────────────────────────────────────

console.log(h1('  ── STRATEGY RECOMMENDATIONS ─────────────────────────────────────────'));
const context = earningsNear && highIV ? `HIGH IV + Earnings in ${daysToEarnings} days`
  : earningsNear ? `Earnings in ${daysToEarnings} days (IV normal)`
  : highIV ? 'HIGH IV environment (no near-term event)'
  : 'Normal IV, no near-term catalyst';
console.log(`  Context: ${chalk.yellow(context)}`);
console.log();

const wingW = Math.max(5, Math.round(price * 0.05 / 5) * 5);
const sellC = nearStrikes.find(s => s >= price * 1.04) ?? atm + wingW;
const buyC = sellC + wingW;
const sellP = nearStrikes.findLast?.(s => s <= price * 0.96) ?? nearStrikes.slice().reverse().find(s => s < price * 0.96) ?? atm - wingW;
const buyP = sellP - wingW;

if (earningsNear && highIV) {
  console.log(chalk.green('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.green('  │ RECOMMENDED: IRON CONDOR  (sell IV before earnings crush)        │'));
  console.log(chalk.green(`  │   Sell ${String(sellC).padEnd(7)} Call  +  Buy ${String(buyC).padEnd(7)} Call             │`));
  console.log(chalk.green(`  │   Sell ${String(sellP).padEnd(7)} Put   +  Buy ${String(buyP).padEnd(7)} Put              │`));
  console.log(chalk.green('  │   Rationale: High IV → sell premium; wings cap max loss          │'));
  console.log(chalk.green('  │   Risk: Gap beyond wings on earnings surprise                    │'));
  console.log(chalk.green('  └─────────────────────────────────────────────────────────────────┘'));
} else if (earningsNear && !highIV) {
  console.log(chalk.green('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.green('  │ RECOMMENDED: LONG STRADDLE  (earnings play, IV affordable)       │'));
  console.log(chalk.green(`  │   Buy $${atm} Call + Buy $${atm} Put (ATM)                          │`));
  if (expMove1) {
    console.log(chalk.green(`  │   Straddle cost: ~$${fmt2(expMove1)}  (±${fmt2(expMovePct1)}%)                     │`));
    console.log(chalk.green(`  │   Break-even: $${fmt2(price - expMove1)} or $${fmt2(price + expMove1)}           │`));
  }
  console.log(chalk.green('  │   Rationale: Low IV → cheap convexity; earnings = binary event  │'));
  console.log(chalk.green('  └─────────────────────────────────────────────────────────────────┘'));
} else if (highIV && !earningsNear) {
  console.log(chalk.green('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.green('  │ RECOMMENDED: COVERED CALL / CASH-SECURED PUT  (sell premium)     │'));
  console.log(chalk.green('  │   IV elevated with no event → premium selling edge               │'));
  console.log(chalk.green(`  │   Sell ${String(sellC).padEnd(7)} Call (covered) or ${String(sellP).padEnd(7)} Put (CSP)  │`));
  console.log(chalk.green('  └─────────────────────────────────────────────────────────────────┘'));
} else {
  console.log(chalk.green('  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.green('  │ RECOMMENDED: BULL CALL SPREAD  (defined risk, normal IV)         │'));
  console.log(chalk.green(`  │   Buy $${atm} Call + Sell $${sellC} Call                              │`));
  console.log(chalk.green('  │   Rationale: Limits premium outlay in normal IV environment      │'));
  console.log(chalk.green('  └─────────────────────────────────────────────────────────────────┘'));
}
console.log();

// Alternatives
const otmCallStrike = nearStrikes.find(s => s > atm);
const otmPutStrike = nearStrikes.findLast?.(s => s < atm) ?? nearStrikes.slice().reverse().find(s => s < atm);
const ccCallOpt = otmCallStrike ? chain1.calls.find(o => o.strike === otmCallStrike) : null;
const cspPutOpt = otmPutStrike ? chain1.puts.find(o => o.strike === otmPutStrike) : null;
const atmPutOpt = chain1.puts.find(o => o.strike === atm);
const ccPrice = optPrice(ccCallOpt);
const cspPrice = optPrice(cspPutOpt);
const atmPutPrice = optPrice(atmPutOpt);

console.log('  Alternatives:');
if (ccCallOpt && ccPrice != null) {
  const yield_ = ((ccPrice / price) * 100).toFixed(2);
  console.log(`  1. COVERED CALL    — Sell $${otmCallStrike} Call @ $${fmt2(ccPrice)} (${yield_}%/period)`);
  console.log(`     Best if: Own shares, neutral-to-bullish bias`);
}
if (cspPutOpt && cspPrice != null) {
  const yield_ = ((cspPrice / price) * 100).toFixed(2);
  console.log(`  2. CASH-SEC. PUT   — Sell $${otmPutStrike} Put @ $${fmt2(cspPrice)} (${yield_}%/period)`);
  console.log(`     Best if: Want shares at a discount`);
}
if (expMove1) {
  console.log(`  3. LONG STRADDLE   — Buy $${atm} Straddle @ ~$${fmt2(expMove1)}`);
  console.log(`     Break-even: $${fmt2(price - expMove1)} or $${fmt2(price + expMove1)}`);
  console.log(`     Best if: Expecting large move, direction unknown`);
}
if (atmPutOpt && atmPutPrice != null) {
  const hedgeCost = ((atmPutPrice / price) * 100).toFixed(2);
  console.log(`  4. PROTECTIVE PUT  — Buy $${atm} Put @ $${fmt2(atmPutPrice)} (${hedgeCost}% hedge cost)`);
  console.log(`     Best if: Long shares, hedging into uncertainty`);
}
console.log();

if (earningsFocus && earningsTs && daysToEarnings >= 0) {
  console.log(h1('  ── EARNINGS VOLATILITY DEEP DIVE ────────────────────────────────────'));
  console.log(`  Event: Earnings ${fmtDate(earningsTs)} (${daysToEarnings} days)`);
  if (iv1) console.log(`  Pre-earnings IV: ${(iv1 * 100).toFixed(1)}% — ${iv1 > 0.5 ? chalk.red('elevated, IV crush expected post-earnings') : chalk.green('moderate, straddle may offer value')}`);
  if (expMove1) {
    console.log(`  Options-implied move: ±$${fmt2(expMove1)} (±${fmt2(expMovePct1)}%)`);
    console.log();
    console.log(chalk.dim('  Compare to recent historical earnings moves to judge if options are'));
    console.log(chalk.dim('  cheap (historical > implied → buy straddle) or expensive (sell IC).'));
  }
  console.log();
  console.log('  Earnings playbook:');
  console.log(`  • Straddle entry:  3–5 days before earnings (avoid last-day IV spike)`);
  console.log(`  • Straddle exit:   Day of earnings close — before announcement`);
  console.log(`  • Iron condor:     Open 2–3 weeks out at high IV; close day before`);
  console.log(`  • Size:            Max 2–3% portfolio risk per earnings trade`);
  console.log();
}
