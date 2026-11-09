// 排程成功標記與失敗偵測：每個推播成功（或正常略過）後寫入 data/last-success.json，
// 獨立的 watchdog 排程在 18:40 檢查今天是否都有標記，缺了就發 Discord 警報。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export const JOBS = [
  { id: 'tw-chips', label: '17:30 臺股三大法人' },
  { id: 'market-radar', label: '18:00 美股市場雷達' },
  { id: 'watchlist', label: '18:10 美股 Watchlist' },
];

export const taipeiDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function readMarks(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}

// status: 'ok' | 'skipped'（休市日、資料尚未公布等正常略過）
export function markSuccess(file, id, status = 'ok', now = new Date()) {
  const marks = readMarks(file);
  marks[id] = { date: taipeiDate(now), time: now.toISOString(), status };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(marks, null, 1));
}

// 回傳今天沒有標記的工作（含最後一次成功時間）
export function missingJobs(marks, today, jobs = JOBS) {
  return jobs
    .filter(j => marks?.[j.id]?.date !== today)
    .map(j => ({ ...j, last: marks?.[j.id]?.time ?? null }));
}
