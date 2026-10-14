import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

console.log('Verifying US Stock Analysis setup...\n');

const checks = [];

// Node version
const nodeVer = process.version;
const nodeMajor = parseInt(nodeVer.slice(1));
checks.push({ label: `Node.js ${nodeVer}`, ok: nodeMajor >= 18, fix: 'Requires Node.js 18+' });

// Dependencies — check node_modules directory directly (works for both CJS and ESM)
for (const dep of ['chalk', 'cli-table3', 'puppeteer-core']) {
  const ok = existsSync(path.join(root, 'node_modules', dep));
  checks.push({ label: `npm: ${dep}`, ok, fix: `Run: npm install` });
}

// Network (quick Yahoo Finance ping)
let networkOk = false;
try {
  execSync('curl -s --max-time 5 https://query1.finance.yahoo.com/v1/test/getcrumb -o /dev/null', { stdio: 'pipe' });
  networkOk = true;
} catch {}
checks.push({ label: 'Yahoo Finance reachable', ok: networkOk, fix: 'Check internet connection' });

let allOk = true;
for (const c of checks) {
  const icon = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon}  ${c.label}${c.ok ? '' : `  →  ${c.fix}`}`);
  if (!c.ok) allOk = false;
}

console.log();
if (allOk) {
  console.log('\x1b[32mAll checks passed. Ready to use.\x1b[0m');
  console.log('\nQuick start:');
  console.log('  node scripts/stock-eval.js AAPL       # analyze one stock');
  console.log('  node scripts/stock-screen.js           # screen default watchlist');
  console.log('  node scripts/stock-screen.js AAPL NVDA NOK  # custom list');
} else {
  console.log('\x1b[31mSome checks failed — fix the issues above before running.\x1b[0m');
  process.exit(1);
}
