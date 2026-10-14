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

// 上櫃（櫃買中心）三大法人買賣明細：24 欄固定版型
// 0 代號 1 名稱 | 8-10 外資及陸資合計 | 11-13 投信 | 20-22 自營商合計 | 23 三大法人合計（股）
export function parseTpex(json) {
  const t = json?.tables?.[0];
  if (json?.stat !== 'ok' || !t?.data?.length) return [];
  if (t.fields?.length !== 24) throw new Error('TPEx 欄位格式改變');
  return t.data.map(r => ({
    code: String(r[0]).trim(), name: String(r[1]).trim(),
    foreign: num(r[10]), trust: num(r[13]), dealer: num(r[22]), total: num(r[23]),
  }));
}

// 依代號挑出自選股；找不到的（停牌、休市、指數）回傳 null
export function pickWatch(rows, watch) {
  const by = new Map(rows.map(r => [r.code, r]));
  return watch.map(w => ({ code: w.code, name: w.name, row: by.get(w.code) ?? null }));
}

export async function fetchChips(yyyymmdd) {
  const slash = `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6)}`;
  const [amt, stk, otc] = await Promise.all([
    getJson(`${BASE}/BFI82U?dayDate=${yyyymmdd}&type=day&response=json`),
    getJson(`${BASE}/T86?date=${yyyymmdd}&selectType=ALLBUT0999&response=json`),
    getJson(`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${slash}&id=&response=json`)
      .catch(e => { process.stderr.write(`上櫃資料抓取失敗（只推上市）: ${e.message}\n`); return null; }),
  ]);
  const listed = parseT86(stk);
  const otcRows = otc ? parseTpex(otc) : [];
  return { summary: parseBFI82U(amt), rows: [...listed, ...otcRows], listedCount: listed.length, otcCount: otcRows.length };
}
