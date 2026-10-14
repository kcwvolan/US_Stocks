// 單一標的深度分析（報價、財務、技術、估值、訊號、選擇權、新聞）；各推播共用。
// 臺股用 Yahoo 代號：上市 2330.TW、上櫃 8299.TWO（選擇權資料通常沒有，會是 null）。
import {
  getQuote, getSummary, getHistory, getHistoryFull,
  getOptionsWithDteFloor, getCalendar, getNews,
} from './fetch.js';
import { fundamentals, technicals, valuationAnalysis, signalBlock, convictionParts } from './analyze.js';
import { computeTechnicals } from './technicals.js';
import { computeOptions } from './options.js';

export async function deepAnalyze(sym) {
  const [quote, summary, history, histFull, optData, calendar, news] = await Promise.all([
    getQuote(sym),
    getSummary(sym),
    getHistory(sym),
    getHistoryFull(sym),
    getOptionsWithDteFloor(sym, 7).catch(() => null),
    getCalendar(sym).catch(() => null),
    getNews(sym, 3).catch(() => []),
  ]);
  const fund = fundamentals(summary, quote);
  const tech = technicals(history);
  const ta   = computeTechnicals(quote, histFull);
  const val  = valuationAnalysis(fund);
  const sigs = signalBlock(fund, tech);
  const opts = optData ? computeOptions(quote, optData, calendar) : null;
  const conviction = convictionParts(sigs, ta, val, opts).total;
  return { sym, fund, tech, ta, val, sigs, opts, conviction, hist: histFull, news };
}
