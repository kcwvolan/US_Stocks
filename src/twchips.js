// 臺股三大法人買賣超：解析與排名（純函式）＋證交所資料抓取。
// 資料來源：臺灣證券交易所 BFI82U（買賣金額統計）、T86（個股買賣超日報）。
const BASE = 'https://www.twse.com.tw/rwd/zh/fund';

export const num = s => {
  const n = Number(String(s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

// 個股：外資＝外陸資(不含外資自營商)＋外資自營商；自營商＝自行買賣＋避險；單位股
export function parseT86(json) {
  if (json?.stat !== 'OK' || !Array.isArray(json.data) || !json.data.length) return [];
  const idx = name => json.fields.findIndex(f => f.includes(name));
  const iCode = idx('證券代號'), iName = idx('證券名稱');
  const iF1 = json.fields.findIndex(f => f.startsWith('外陸資買賣超')), iF2 = json.fields.findIndex(f => f.startsWith('外資自營商買賣超'));
  const iIT = json.fields.findIndex(f => f.startsWith('投信買賣超')), iDl = json.fields.findIndex(f => f === '自營商買賣超股數');
  const iAll = json.fields.findIndex(f => f.startsWith('三大法人買賣超'));
  if ([iCode, iName, iF1, iF2, iIT, iDl, iAll].some(i => i < 0)) throw new Error('T86 欄位格式改變');
  return json.data.map(r => ({
    code: String(r[iCode]).trim(),
    name: String(r[iName]).trim(),
    foreign: num(r[iF1]) + num(r[iF2]),
    trust: num(r[iIT]),
    dealer: num(r[iDl]),
    total: num(r[iAll]),
  }));
}

// ETF（代號 00 開頭）不列入個股排名
export const isStock = row => !/^00/.test(row.code);

export function topN(rows, key, n = 10) {
  const r = rows.filter(isStock).filter(x => x[key] !== 0);
  return {
    buy: r.filter(x => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, n),
    sell: r.filter(x => x[key] < 0).sort((a, b) => a[key] - b[key]).slice(0, n),
  };
}

// 金額統計：回傳各法人買賣差額（億元）
export function parseBFI82U(json) {
  if (json?.stat !== 'OK' || !Array.isArray(json.data) || !json.data.length) return null;
  const diff = name => {
    const r = json.data.find(x => String(x[0]).startsWith(name));
    return r ? num(r[3]) / 1e8 : 0;
  };
  const foreign = diff('外資及陸資') + diff('外資自營商');
  const trust = diff('投信');
  const dealer = diff('自營商(自行買賣)') + diff('自營商(避險)');
  return { foreign, trust, dealer, total: foreign + trust + dealer };
}

export const lots = shares => Math.round(shares / 1000);   // 股 → 張

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status} — ${url}`);
  return res.json();
}

export async function fetchChips(yyyymmdd) {
  const [amt, stk] = await Promise.all([
    getJson(`${BASE}/BFI82U?dayDate=${yyyymmdd}&type=day&response=json`),
    getJson(`${BASE}/T86?date=${yyyymmdd}&selectType=ALLBUT0999&response=json`),
  ]);
  return { summary: parseBFI82U(amt), rows: parseT86(stk) };
}
