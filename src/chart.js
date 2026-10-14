/**
 * 漲跌幅長條圖：呼叫 QuickChart 產生短網址，放進 Discord embed.image。
 * 任何失敗都回傳 null，推播照常進行（圖表只是加分，不能拖垮主流程）。
 * 外送資料只有「代號 + 漲跌%」，不含持股數量或金額。
 */
export function buildChangeConfig(rows, title) {
  const data = [...rows]
    .filter(r => r.chg != null && !Number.isNaN(+r.chg))
    .sort((a, b) => b.chg - a.chg);
  return {
    type: 'bar',
    data: {
      labels: data.map(r => r.sym),
      datasets: [{
        data: data.map(r => +(+r.chg).toFixed(2)),
        backgroundColor: data.map(r => (r.chg >= 0 ? '#3DCC8A' : '#E8445A')),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, color: '#E6EAF0', font: { size: 18 } },
        datalabels: {
          color: '#E6EAF0', anchor: 'end', align: 'end',
          formatter: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%',
        },
      },
      layout: { padding: { right: 56 } },
      scales: {
        x: { grid: { color: '#2B3445' }, ticks: { color: '#9AA6B8' } },
        y: { grid: { display: false }, ticks: { color: '#E6EAF0', font: { size: 14 } } },
      },
    },
  };
}

export async function changeChartUrl(rows, title) {
  if (!rows?.length) return null;
  try {
    const res = await fetch('https://quickchart.io/chart/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        version: '3',
        backgroundColor: '#1B2230',
        width: 800,
        height: Math.max(320, 70 + rows.length * 34),
        format: 'png',
        chart: buildChangeConfig(rows, title),
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.success && j.url ? j.url : null;
  } catch {
    return null;
  }
}
