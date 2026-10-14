#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getQuote, getSummary, getHistory, getHistoryFull,
  getOptionsWithDteFloor, getCalendar,
} from '../src/fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, incomeHistory } from '../src/analyze.js';
import { computeTechnicals } from '../src/technicals.js';
import { computeOptions } from '../src/options.js';
import { buildMarkdownReport } from '../src/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const reportsDir = path.join(ROOT, 'reports');
const logsDir    = path.join(ROOT, 'logs');
const dataDir    = path.join(ROOT, 'data');
const STATE_FILE = path.join(dataDir, 'portfolio_state.json');

// ── Config ─────────────────────────────────────────────────────────────────────
// --force-full or MONITOR_FORCE_FULL=1 classifies every ticker as MATERIAL_CHANGE,
// bypassing state comparison (useful for initial seed or after a long gap).
const FORCE_FULL = process.argv.includes('--force-full') || process.env.MONITOR_FORCE_FULL === '1';

const T = {
  material: { price: 0.03, iv: 0.10, score: 1.5 },
  drift:    { price: 0.01, iv: 0.05, score: 0.5 },
};

// ── Logging ────────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const logLines = [];

function log(level, msg) {
  const icon = { INFO: '  ', WARN: '⚠ ', ERROR: '✗ ', OK: '✓ ' }[level] ?? '  ';
  logLines.push(JSON.stringify({ ts: new Date().toISOString(), level, msg }));
  process.stdout.write(`${icon}${msg}\n`);
}

function flushLog() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, `monitor_${today}.log`), logLines.join('\n') + '\n', 'utf8');
}

// ── State I/O ──────────────────────────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    log('WARN', `Could not load state: ${e.message} — treating all tickers as first run`);
  }
  return { lastRun: null, tickers: {} };
}

function saveState(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ── Snapshot extraction ────────────────────────────────────────────────────────
// Only numeric/string primitives — no formatted strings — so diffs are arithmetic.
function extractSnapshot(fund, sigs, val, opts) {
  const toNum = s => { const n = parseFloat(s); return isNaN(n) ? null : n; };
  return {
    date:          today,
    price:         fund.price        ?? null,
    signal:        sigs.overall      ?? null,
    score:         sigs.score        ?? null,
    iv1:           opts?.iv1         ?? null,
    ivEnv:         opts?.ivEnv       ?? null,
    targetPrice:   val.targetPrice   ?? null,
    upside:        val.upside        ?? null,
    pe:            toNum(fund.pe),
    revenueGrowth: toNum(fund.revenueGrowth),
  };
}

// ── Diff ───────────────────────────────────────────────────────────────────────
// Returns an array of change descriptors. Empty array = no measurable change.
function diff(current, prior) {
  if (!prior) return [{ field: 'first_run', delta: null, detail: 'No prior state' }];

  const changes = [];

  if (current.price != null && (prior.price ?? 0) > 0) {
    const delta = Math.abs((current.price - prior.price) / prior.price);
    if (delta > 0) {
      const dir = current.price >= prior.price ? '+' : '-';
      changes.push({
        field: 'price', delta,
        detail: `price ${dir}${(delta * 100).toFixed(1)}% ($${prior.price.toFixed(2)} → $${current.price.toFixed(2)})`,
      });
    }
  }

  if (current.iv1 != null && prior.iv1 != null) {
    const delta = Math.abs(current.iv1 - prior.iv1);
    if (delta > 0) {
      const dir = current.iv1 >= prior.iv1 ? '+' : '-';
      changes.push({
        field: 'iv1', delta,
        detail: `IV ${dir}${(delta * 100).toFixed(1)}pp (${(prior.iv1 * 100).toFixed(1)}% → ${(current.iv1 * 100).toFixed(1)}%)`,
      });
    }
  }

  if (current.score != null && prior.score != null) {
    const delta = Math.abs(current.score - prior.score);
    if (delta > 0) {
      const dir = current.score >= prior.score ? '+' : '-';
      changes.push({
        field: 'score', delta,
        detail: `score ${dir}${delta.toFixed(1)} (${prior.score.toFixed(1)} → ${current.score.toFixed(1)})`,
      });
    }
  }

  if (prior.signal && current.signal && prior.signal !== current.signal) {
    changes.push({
      field: 'signal', delta: null,
      detail: `signal ${prior.signal} → ${current.signal}`,
    });
  }

  return changes;
}

// ── Classify ───────────────────────────────────────────────────────────────────
function classify(changes) {
  if (FORCE_FULL) return 'MATERIAL_CHANGE';
  if (changes.some(c => c.field === 'first_run' || c.field === 'signal')) return 'MATERIAL_CHANGE';

  const price = changes.find(c => c.field === 'price');
  const iv    = changes.find(c => c.field === 'iv1');
  const score = changes.find(c => c.field === 'score');

  if (
    (price?.delta ?? 0) >  T.material.price ||
    (iv?.delta    ?? 0) >  T.material.iv    ||
    (score?.delta ?? 0) >= T.material.score
  ) return 'MATERIAL_CHANGE';

  if (
    (price?.delta ?? 0) >  T.drift.price ||
    (iv?.delta    ?? 0) >  T.drift.iv    ||
    (score?.delta ?? 0) >= T.drift.score
  ) return 'MINOR_DRIFT';

  return 'UNCHANGED';
}

// ── Per-ticker pipeline ────────────────────────────────────────────────────────
async function monitorOne(symbol, priorState) {
  const prior = priorState.tickers[symbol] ?? null;

  const [quote, summary, history, histFull, optData, calendar] = await Promise.all([
    getQuote(symbol),
    getSummary(symbol),
    getHistory(symbol),
    getHistoryFull(symbol),
    getOptionsWithDteFloor(symbol, 7).catch(e => {
      log('WARN', `${symbol} options skipped: ${e.message}`);
      return null;
    }),
    getCalendar(symbol).catch(e => {
      log('WARN', `${symbol} calendar skipped: ${e.message}`);
      return null;
    }),
  ]);

  const fund = fundamentals(summary, quote);
  const tech = technicals(history);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const hist = incomeHistory(summary);
  const ta   = computeTechnicals(quote, histFull);
  const opts = optData ? computeOptions(quote, optData, calendar) : null;

  const snapshot       = extractSnapshot(fund, sigs, val, opts);
  const changes        = diff(snapshot, prior);
  const classification = classify(changes);

  let reportPath = null;
  if (classification === 'MATERIAL_CHANGE') {
    const md = buildMarkdownReport({ symbol, fund, val, sigs, hist, ta, opts });
    reportPath = path.join(reportsDir, `${symbol}_${today}.md`);
    fs.writeFileSync(reportPath, md, 'utf8');
  }

  return { symbol, classification, changes, snapshot, reportPath, fund, sigs, opts };
}

// ── Briefing builder ───────────────────────────────────────────────────────────
function buildBriefing(results, failures, elapsed) {
  const material  = results.filter(r => r.classification === 'MATERIAL_CHANGE');
  const drift     = results.filter(r => r.classification === 'MINOR_DRIFT');
  const unchanged = results.filter(r => r.classification === 'UNCHANGED');

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const mode = FORCE_FULL ? ' _(force-full)_' : '';

  const L = [];
  L.push(`# Portfolio Morning Briefing — ${dateStr}`);
  L.push('');
  L.push(`Generated: ${new Date().toISOString()}${mode} | ${results.length + failures.length} tickers · **${material.length} material** · ${drift.length} drift · ${unchanged.length} unchanged · ${failures.length} errors | ${elapsed}s`);
  L.push('');

  // ── Immediate action ──
  L.push('## Immediate Action Required');
  L.push('');
  if (material.length === 0) {
    L.push('_No material changes detected._');
    L.push('');
  } else {
    for (const r of material) {
      const actualChanges = r.changes.filter(c => c.field !== 'first_run');
      const summary = actualChanges.length > 0
        ? actualChanges.map(c => c.detail).join(' · ')
        : 'Initial analysis';
      const reportLink = r.reportPath
        ? ` · [Full report](${path.basename(r.reportPath)})`
        : '';
      L.push(`**${r.symbol}** — ${summary}${reportLink}`);
      L.push(`  Signal: ${r.sigs.overall} · Score: ${r.sigs.score?.toFixed(1) ?? 'N/A'} · IV: ${r.opts?.ivEnv ?? 'N/A'}`);
      L.push('');
    }
  }

  // ── Monitor closely ──
  L.push('## Monitor Closely');
  L.push('');
  if (drift.length === 0) {
    L.push('_No drift tickers._');
    L.push('');
  } else {
    for (const r of drift) {
      const summary = r.changes.map(c => c.detail).join(' · ');
      L.push(`**${r.symbol}** — ${summary}`);
    }
    L.push('');
  }

  // ── Unchanged table ──
  L.push('## Unchanged');
  L.push('');
  if (unchanged.length === 0) {
    L.push('_All tickers had at least minor drift._');
  } else {
    L.push('| Ticker | Price | Signal | IV Env | Score |');
    L.push('|--------|-------|--------|--------|-------|');
    for (const r of unchanged) {
      const price = r.fund.price != null ? `$${r.fund.price.toFixed(2)}` : 'N/A';
      L.push(`| ${r.symbol} | ${price} | ${r.sigs.overall} | ${r.opts?.ivEnv ?? 'N/A'} | ${r.sigs.score?.toFixed(1) ?? 'N/A'} |`);
    }
  }
  L.push('');

  // ── Errors ──
  L.push('## Errors');
  L.push('');
  if (failures.length === 0) {
    L.push('_None._');
  } else {
    L.push('| Ticker | Error |');
    L.push('|--------|-------|');
    for (const f of failures) {
      L.push(`| ${f.symbol} | ${f.error.replace(/\|/g, '/')} |`);
    }
  }
  L.push('');

  return L.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
const watchlistPath = path.join(ROOT, 'watchlist.json');
if (!fs.existsSync(watchlistPath)) {
  console.error('watchlist.json not found — create it with {"tickers":["AAPL","MSFT",...]}');
  process.exit(1);
}

const { tickers } = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
if (!tickers?.length) {
  console.error('watchlist.json: tickers array is empty');
  process.exit(1);
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(logsDir,    { recursive: true });
fs.mkdirSync(dataDir,    { recursive: true });

const priorState = loadState();
log('INFO', `Portfolio monitor started — ${tickers.length} tickers · last run: ${priorState.lastRun ?? 'never'}${FORCE_FULL ? ' · FORCE_FULL' : ''}`);

const scanStart = Date.now();

const settled = await Promise.allSettled(
  tickers.map(t => monitorOne(t.toUpperCase(), priorState))
);

const results  = [];
const failures = [];

for (let i = 0; i < settled.length; i++) {
  const s   = settled[i];
  const sym = tickers[i].toUpperCase();
  if (s.status === 'fulfilled') {
    const r = s.value;
    results.push(r);
    const changeStr = r.changes.filter(c => c.field !== 'first_run').map(c => c.detail).join(' | ') || 'no change';
    log(r.classification === 'MATERIAL_CHANGE' ? 'OK' : 'INFO',
      `${sym}  ${r.classification}  ${changeStr}`);
  } else {
    failures.push({ symbol: sym, error: s.reason?.message ?? String(s.reason) });
    log('ERROR', `${sym}: ${s.reason?.message ?? s.reason}`);
  }
}

// Persist new state for every successfully analysed ticker
const newState = { lastRun: today, tickers: { ...priorState.tickers } };
for (const r of results) newState.tickers[r.symbol] = r.snapshot;
saveState(newState);
log('INFO', `State saved → ${STATE_FILE}`);

const elapsed     = ((Date.now() - scanStart) / 1000).toFixed(1);
const briefing    = buildBriefing(results, failures, elapsed);
const briefingPath = path.join(reportsDir, `morning_briefing_${today}.md`);
fs.writeFileSync(briefingPath, briefing, 'utf8');
log('OK', `Morning briefing → ${briefingPath}`);

flushLog();

// Exit 1 only when every ticker failed — partial results are still useful
process.exit(results.length === 0 && failures.length > 0 ? 1 : 0);
