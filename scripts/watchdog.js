/**
 * 推播失敗警報（獨立排程，每天 18:40）：今天缺成功標記的推播，發 Discord 提醒。
 * 這支程式本身若沒跑（電腦關機、睡眠）就不會有警報——它只能抓到「推播沒成功」。
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readMarks, missingJobs, taipeiDate } from '../src/heartbeat.js';
import { getWebhook } from '../src/webhook.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = taipeiDate();
const missing = missingJobs(readMarks(join(root, 'data/last-success.json')), today);
if (!missing.length) { console.log(`✅ ${today} 三個推播都有成功標記`); process.exit(0); }

let launchd = '';
try {
  const out = execSync('launchctl list', { encoding: 'utf8' });
  launchd = out.split('\n').filter(l => /com\.kcw\.discord-/.test(l)).map(l => {
    const [, code, label] = l.trim().split(/\s+/);
    return `${label.replace('com.kcw.discord-', '')} 結束代碼 ${code}`;
  }).join('；');
} catch {}

const fmt = t => (t ? new Date(t).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '從未成功');
const embed = {
  color: 0xE8445A,
  title: '⚠️ 推播排程今天沒有成功',
  description: missing.map(j => `• **${j.label}**　上次成功：${fmt(j.last)}`).join('\n')
    + (launchd ? `\n\nlaunchd：${launchd}` : '')
    + `\n\n查看：\`${root}/discord-*.log\`（結束代碼 126＝/bin/bash 缺完整磁碟取用權；其他錯誤見 log）`,
  footer: { text: `檢查日期 ${today}（臺灣時間）` },
};
const res = await fetch(getWebhook(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
console.log(`⚠️ 已發警報：${missing.map(j => j.id).join(', ')}`);
