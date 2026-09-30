// Leest data/house.json (+ optioneel import/*.csv), rekent en schrijft docs/latest.json.
// Gebruik:  node src/compute.mjs [--asof=JJJJ-MM-DD] [--stdout]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compute, sensitivity } from './engine.mjs';
import { loadImports } from './import-csv.mjs';

const root = new URL('../', import.meta.url);
const cfg = JSON.parse(fs.readFileSync(new URL('config.json', root)));
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const asOf = arg('asof') || new Date().toISOString().slice(0, 10);

const houseFile = new URL('data/house.json', root);
const house = fs.existsSync(houseFile) ? JSON.parse(fs.readFileSync(houseFile)) : null;
const imports = loadImports(path.join(fileURLToPath(root), 'import'));

let txs = [];
const warnings = [];
const chambers = new Set();
const importChambers = new Set(imports.rows.map(r => r.chamber));
if (house && !importChambers.has('Huis')) { txs.push(...house.transactions); chambers.add('Huis'); }
else if (!house && !importChambers.has('Huis')) warnings.push('Geen House-gegevens opgehaald.');
txs.push(...imports.rows);
imports.rows.forEach(r => chambers.add(r.chamber));
warnings.push(...imports.warnings);

if (!chambers.has('Senaat')) warnings.push('Senaat ontbreekt: alleen Huis-meldingen zijn meegeteld. De echte lijst bevat ook Senaatsaankopen.');
const problems = house ? house.problemDocs.filter(d => d.filingDate <= asOf).length : 0;
if (problems) warnings.push(`${problems} House-melding(en) konden niet gelezen worden (gescand of fout); hun aankopen ontbreken.`);

const result = compute(txs, cfg, asOf);
if (result.capInfeasible) warnings.push('Te weinig tickers voor het 50%-plafond; plafond kon niet worden toegepast.');
if (result.belowMinTickers) warnings.push('Minder tickers dan het ingestelde minimum.');
if (result.skippedNoAmount) warnings.push(`${result.skippedNoAmount} transactie(s) zonder leesbaar bedrag overgeslagen.`);
if (!result.positions.length) warnings.push('Geen geschikte aankopen in het venster; geen positielijst mogelijk.');

const sens = sensitivity(txs, cfg, asOf);
const key = s => s.top2.join('+');
const base = result.positions.slice(0, 2).map(p => p.ticker).join('+');
const sameTop2 = sens.filter(s => key(s) === base).length;

const out = {
  schema: 1,
  source: 'Eigen berekening',
  disclaimer: 'Eigen benadering op basis van officiële meldingen. GEEN officiële Quiver-ranglijst.',
  generatedAt: new Date().toISOString(),
  asOf,
  latestPublished: result.latestPublished,
  latestTrade: result.latestTrade,
  sourceCheckedAt: house ? house.indexCheckedAt : null,
  coverage: { huis: chambers.has('Huis'), senaat: chambers.has('Senaat') },
  warnings,
  parameters: { windowDays: cfg.windowDays, amountMapping: cfg.amountMapping, assetTypes: cfg.assetTypes, maxWeight: cfg.maxWeight, status: cfg.parameterStatus || 'aannames, niet geverifieerd' },
  stats: { tickers: result.tickerCount, transactions: result.transactionCount, duplicatesRemoved: result.duplicatesRemoved, totalAmount: result.totalAmount },
  stability: { variants: sens.length, sameTop2: sameTop2 },
  top2: result.positions.slice(0, 2),
  positions: result.positions.slice(0, 15),
  detailUrl: cfg.detailUrl
};
if (process.argv.includes('--stdout')) console.log(JSON.stringify(out, null, 1));
else {
  fs.writeFileSync(new URL('docs/latest.json', root), JSON.stringify(out, null, 1));
  console.log(`docs/latest.json geschreven. Top 2: ${out.top2.map(p => `${p.ticker} ${(p.weight * 100).toFixed(1)}%`).join(', ') || '(geen)'}; stabiliteit ${sameTop2}/${sens.length}`);
  warnings.forEach(w => console.log('  ! ' + w));
}
