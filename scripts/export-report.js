#!/usr/bin/env node
// Export a report markdown file to HTML and/or PDF, optionally translated to Traditional Chinese.
//
// Usage:
//   node scripts/export-report.js <report.md> [--html] [--pdf] [--zh]
//
// Options:
//   --html   Write <report>.zh-TW.html (or <report>.html without --zh)
//   --pdf    Write <report>.zh-TW.pdf  (or <report>.pdf without --zh); requires Chrome
//   --zh     Translate to Traditional Chinese (繁體中文) via Claude API
//
// At least one of --html or --pdf is required.
// ANTHROPIC_API_KEY must be set in the environment when --zh is used.
//
// Examples:
//   node scripts/export-report.js reports/NVDA_20260508.md --html --pdf --zh
//   node scripts/export-report.js reports/morning_briefing_20260508.md --html --zh

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as mdParse } from 'marked';
import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── CLI ────────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const doHtml  = args.includes('--html');
const doPdf   = args.includes('--pdf');
const doZh    = args.includes('--zh');
const inputArg = args.find(a => !a.startsWith('--'));

if (!inputArg || (!doHtml && !doPdf)) {
  console.error([
    '',
    chalk.bold('Usage:'),
    '  node scripts/export-report.js <report.md> [--html] [--pdf] [--zh]',
    '',
    chalk.bold('Options:'),
    '  --html   Generate HTML file',
    '  --pdf    Generate PDF file (requires Google Chrome)',
    '  --zh     Translate to Traditional Chinese via Claude API',
    '',
    chalk.bold('Examples:'),
    '  node scripts/export-report.js reports/NVDA_20260508.md --html --pdf --zh',
    '  node scripts/export-report.js reports/morning_briefing_20260508.md --html --zh',
    '',
  ].join('\n'));
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(chalk.red(`File not found: ${inputPath}`));
  process.exit(1);
}

const lang    = doZh ? 'zh-TW' : 'en';
const stem    = path.basename(inputPath, '.md');
const outDir  = path.dirname(inputPath);
const suffix  = doZh ? '.zh-TW' : '';
const htmlOut = path.join(outDir, `${stem}${suffix}.html`);
const pdfOut  = path.join(outDir, `${stem}${suffix}.pdf`);

// ── Translation ────────────────────────────────────────────────────────────────
async function translateToZhTW(markdown) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Export it in your shell before running with --zh.');
  }

  const client = new Anthropic();

  process.stdout.write(chalk.cyan('  Translating to Traditional Chinese'));
  const dots = setInterval(() => process.stdout.write('.'), 600);

  let result = '';
  try {
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{
        role:    'user',
        content: [
          'You are a professional financial translator specialising in Traditional Chinese (繁體中文) for Taiwan and Hong Kong markets.',
          '',
          'Translate the stock analysis report below. Rules:',
          '1. Preserve ALL markdown formatting exactly: headings (#/##/###), tables (|), bold (**), italic (*), code (`), horizontal rules (---), blockquotes (>).',
          '2. Do NOT translate: ticker symbols (AAPL, NVDA…), numbers, percentages, dates, currency values, file paths, URLs.',
          '3. Do NOT translate these abbreviations: EPS, P/E, PE, IV, DTE, SMA, RSI, ATM, OI, PCR, MACD, BB, YoY, QoQ, ETF, IPO.',
          '4. Translate signal verdicts consistently: BUY→買入, SELL→賣出, HOLD→持有, STRONG BUY→強力買入, STRONG SELL→強力賣出.',
          '5. Use financial terminology standard in Taiwan: 股票 (stock), 期權 (options), 技術分析 (technical analysis), 基本面 (fundamentals), 市值 (market cap), 本益比 (P/E ratio), 目標價 (target price), 上漲空間 (upside), 隱含波動率 (implied volatility), 到期日 (expiration), 均線 (moving average), 支撐 (support), 壓力 (resistance).',
          '6. Output ONLY the translated markdown. No preamble, no explanation.',
          '',
          '---',
          '',
          markdown,
        ].join('\n'),
      }],
    });
    result = msg.content[0].text;
  } finally {
    clearInterval(dots);
    process.stdout.write('\n');
  }
  return result;
}

// ── HTML template ──────────────────────────────────────────────────────────────
function buildHtml(bodyHtml, title, htmlLang) {
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    /* ── Typography ── */
    body {
      font-family: "PingFang TC", "Noto Serif TC", "Microsoft JhengHei", "Heiti TC",
                   "Georgia", "Times New Roman", serif;
      font-size: 14px;
      line-height: 1.9;
      color: #1a1a2e;
      background: #fff;
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 52px;
    }

    /* ── Headings ── */
    h1 {
      font-size: 1.9em;
      border-bottom: 3px solid #1a1a2e;
      padding-bottom: 0.3em;
      margin-top: 0;
      margin-bottom: 0.4em;
      letter-spacing: 0.02em;
    }
    h2 {
      font-size: 1.25em;
      color: #1e3a8a;
      border-bottom: 1px solid #dde3f0;
      padding-bottom: 0.25em;
      margin-top: 2.2em;
      margin-bottom: 0.6em;
    }
    h3 {
      font-size: 1.05em;
      color: #374151;
      margin-top: 1.6em;
      margin-bottom: 0.4em;
    }

    /* ── Metadata line (italic paragraph right after h1) ── */
    h1 + p em, h1 + blockquote {
      color: #6b7280;
      font-size: 0.88em;
    }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0 1.4em;
      font-size: 0.875em;
    }
    th {
      background: #1a1a2e;
      color: #f9fafb;
      padding: 7px 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 6px 12px;
      border: 1px solid #e5e7eb;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    tr:hover td            { background: #eff6ff; }

    /* ── Code ── */
    code {
      font-family: "SF Mono", "Cascadia Code", "Consolas", "Courier New", monospace;
      font-size: 0.88em;
      background: #f3f4f6;
      padding: 1px 5px;
      border-radius: 4px;
    }
    pre {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 14px 16px;
      overflow-x: auto;
      font-size: 0.85em;
      line-height: 1.6;
    }
    pre code { background: none; padding: 0; }

    /* ── Blockquote (used for summary / metadata lines) ── */
    blockquote {
      border-left: 4px solid #1e3a8a;
      margin: 1em 0;
      padding: 0.5em 1.2em;
      background: #eff6ff;
      color: #374151;
      border-radius: 0 4px 4px 0;
    }

    /* ── Inline elements ── */
    strong { color: #111827; }
    a { color: #1d4ed8; }
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 2em 0;
    }

    /* ── Bullet / numbered lists ── */
    ul, ol { padding-left: 1.6em; margin: 0.5em 0 1em; }
    li { margin: 0.25em 0; }

    /* ── Print / PDF ── */
    @media print {
      body { padding: 0; max-width: 100%; font-size: 11pt; }
      h2   { page-break-after: avoid; }
      table, pre { page-break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
    @page { size: A4; margin: 22mm 18mm; }
  </style>
</head>
<body>
${bodyHtml}
<hr>
<p style="color:#9ca3af;font-size:0.8em;margin-top:2em">
  Exported: ${new Date().toISOString()} ${htmlLang === 'zh-TW' ? '· 繁體中文' : '· English'}
</p>
</body>
</html>`;
}

// ── PDF generation ─────────────────────────────────────────────────────────────
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

async function htmlToPdf(htmlFilePath, pdfFilePath) {
  let puppeteerMod;
  try {
    puppeteerMod = (await import('puppeteer-core')).default;
  } catch {
    throw new Error(
      'puppeteer-core is not installed.\n  Run: npm install puppeteer-core\n' +
      '  PDF generation requires Google Chrome or Chromium on your system.'
    );
  }

  const executablePath = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!executablePath) {
    throw new Error(
      'Chrome/Chromium not found. Install Google Chrome or set the CHROME_PATH env var.'
    );
  }

  const tmpProfile = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'puppeteer-'));
  const browser = await puppeteerMod.launch({
    executablePath,
    headless: true,
    timeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${tmpProfile}`,
    ],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
    });
  } finally {
    await browser.close();
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log();
console.log(chalk.bold(`Exporting: ${chalk.cyan(path.relative(ROOT, inputPath))}`));
console.log(`  Outputs: ${[doHtml && 'HTML', doPdf && 'PDF'].filter(Boolean).join(' + ')} · Language: ${doZh ? 'Traditional Chinese (繁體中文)' : 'English'}`);
console.log();

let markdown = fs.readFileSync(inputPath, 'utf8');
// Strip the auto-appended timestamp footer from the Write hook (e.g. "_Generated: 2026-05-08T..._")
markdown = markdown.replace(/\n_Generated: [^\n]+_\s*$/, '').trimEnd();

// Extract a clean title from the first H1 line
const titleMatch = markdown.match(/^#\s+(.+)/m);
const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : stem;

// ── Step 1: translate ──
if (doZh) {
  process.stdout.write(chalk.dim('  [1/3] '));
  markdown = await translateToZhTW(markdown);
  console.log(chalk.green('  ✓ Translation complete'));
}

// ── Step 2: HTML ──
if (doHtml) {
  process.stdout.write(chalk.dim(doZh ? '  [2/3] ' : '  [1/2] '));
  const bodyHtml = mdParse(markdown);
  const html     = buildHtml(bodyHtml, title, lang);
  fs.writeFileSync(htmlOut, html, 'utf8');
  console.log(chalk.green(`  ✓ HTML  → ${path.relative(ROOT, htmlOut)}`));
}

// ── Step 3: PDF ──
if (doPdf) {
  const stepLabel = doHtml ? (doZh ? '  [3/3] ' : '  [2/2] ') : (doZh ? '  [2/2] ' : '  [1/1] ');
  process.stdout.write(chalk.dim(stepLabel));

  // If we already wrote the HTML, reuse it; otherwise write a temp file
  let htmlSource = htmlOut;
  let tempHtml   = null;
  if (!doHtml) {
    tempHtml  = path.join(outDir, `._export_tmp_${Date.now()}.html`);
    htmlSource = tempHtml;
    const bodyHtml = mdParse(markdown);
    fs.writeFileSync(htmlSource, buildHtml(bodyHtml, title, lang), 'utf8');
  }

  try {
    process.stdout.write(chalk.cyan('Rendering PDF via Chrome'));
    const dots = setInterval(() => process.stdout.write('.'), 700);
    try {
      await htmlToPdf(path.resolve(htmlSource), pdfOut);
    } finally {
      clearInterval(dots);
      process.stdout.write('\n');
    }
    console.log(chalk.green(`  ✓ PDF   → ${path.relative(ROOT, pdfOut)}`));
  } finally {
    if (tempHtml && fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml);
  }
}

console.log();
