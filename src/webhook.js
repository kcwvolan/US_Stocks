// 從環境變數或專案根目錄的 .env 讀取 Discord webhook（避免寫死在程式碼裡）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function getWebhook() {
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*DISCORD_WEBHOOK_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  throw new Error('找不到 DISCORD_WEBHOOK_URL：請在 ' + envPath + ' 設定 DISCORD_WEBHOOK_URL=...');
}
