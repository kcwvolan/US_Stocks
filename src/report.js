import chalk from 'chalk';
import Table from 'cli-table3';

export function printReport(fund, tech) {
  console.log('\n' + chalk.bold.cyan(`=== ${fund.name} (${fund.symbol}) ===`));
  console.log(chalk.gray(`Recommendation: ${colorRec(fund.recommendation)}  |  Target: $${fund.targetPrice}`));

  const t1 = new Table({ head: [chalk.yellow('Metric'), chalk.yellow('Value')] });
  t1.push(
    ['Price', `$${fund.price}  (${colorChange(fund.change1d)}%)`],
    ['Market Cap', fund.marketCap],
    ['P/E (TTM)', fund.pe],
    ['Forward P/E', fund.forwardPE],
    ['EPS', `$${fund.eps}`],
    ['P/B', fund.pbRatio],
    ['ROE', fund.roe],
    ['Revenue Growth', fund.revenueGrowth],
    ['Gross Margin', fund.grossMargin],
    ['Operating Margin', fund.operatingMargin],
    ['Debt/Equity', fund.debtToEquity],
    ['Current Ratio', fund.currentRatio],
  );
  console.log(chalk.bold('\nFundamentals'));
  console.log(t1.toString());

  if (tech) {
    const t2 = new Table({ head: [chalk.yellow('Metric'), chalk.yellow('Value')] });
    t2.push(
      ['SMA 20', `$${tech.sma20}`],
      ['SMA 50', `$${tech.sma50}`],
      ['SMA 200', `$${tech.sma200}`],
      ['RSI (14)', tech.rsi14],
      ['52w High', `$${tech.high52w}`],
      ['52w Low', `$${tech.low52w}`],
      ['From 52w High', `${tech.fromHigh52w}%`],
    );
    console.log(chalk.bold('\nTechnicals (1 Year)'));
    console.log(t2.toString());
  }
  console.log();
}

function colorChange(val) {
  const n = parseFloat(val);
  return n >= 0 ? chalk.green(`+${val}`) : chalk.red(val);
}

function colorRec(rec) {
  const map = { buy: chalk.green, strongBuy: chalk.greenBright, hold: chalk.yellow, sell: chalk.red, strongSell: chalk.redBright };
  return (map[rec] ?? chalk.white)(rec.toUpperCase());
}
