// Eenvoudige tests met verzonnen invoer. Deze waarden komen NOOIT in docs/latest.json terecht.
import assert from 'assert';
import { compute, capWeights, amountOf, dedupe, cleanName } from './engine.mjs';
import { parsePtr } from './pdf-parse.mjs';

const opt = { windowDays: 90, amountMapping: 'mid', assetTypes: ['ST'], transactionTypes: ['P'], maxWeight: 0.5, minTickers: 0 };
const tx = (o) => ({ member: 'A', owner: 'Lid', account: 'x', assetType: 'ST', type: 'P', assetName: o.ticker + ' Inc.', amountRange: '$1,001 - $15,000', docId: String(Math.random()), ...o });

// bedragen
assert.equal(amountOf('$1,001 - $15,000', 'low'), 1001);
assert.equal(amountOf('$1,001 - $15,000', 'high'), 15000);
assert.equal(amountOf('$15,001 - $50,000', 'mid'), 32500.5);
assert.equal(amountOf('Over $50,000,000', 'mid'), 50000000);

// plafond
let w = capWeights({ A: 0.8, B: 0.15, C: 0.05 }, 0.5);
assert(Math.abs(w.A - 0.5) < 1e-9 && Math.abs(w.B - 0.375) < 1e-9 && Math.abs(w.C - 0.125) < 1e-9);
assert(Math.abs(Object.values(w).reduce((a, b) => a + b) - 1) < 1e-9);
w = capWeights({ A: 0.6, B: 0.4 }, 0.5); assert(w.A === 0.5 && w.B === 0.5);
assert(capWeights({ A: 1 }, 0.5).__capInfeasible);

// venster op transactiedatum, geen vooruitkijken
const txs = [
  tx({ ticker: 'AAA', tradeDate: '2026-09-01', publishedDate: '2026-09-10', amountRange: '$50,001 - $100,000' }),
  tx({ ticker: 'BBB', tradeDate: '2026-09-02', publishedDate: '2026-09-20' }),                 // nog niet gepubliceerd op 12 sep
  tx({ ticker: 'CCC', tradeDate: '2026-03-01', publishedDate: '2026-09-05' }),                 // buiten venster (transactiedatum oud)
  tx({ ticker: 'DDD', tradeDate: '2026-09-03', publishedDate: '2026-09-04', type: 'S' }),      // verkoop
  tx({ ticker: 'EEE', tradeDate: '2026-09-03', publishedDate: '2026-09-04', assetType: 'OP' }) // optie
];
let r = compute(txs, opt, '2026-09-12');
assert.deepEqual(r.positions.map(p => p.ticker), ['AAA']);
r = compute(txs, opt, '2026-09-25');
assert.deepEqual(r.positions.map(p => p.ticker).sort(), ['AAA', 'BBB']);

// dubbel + correctie: zelfde rij, latere publicatie wint, telt één keer
const d = dedupe([
  tx({ ticker: 'ZZZ', tradeDate: '2026-09-01', publishedDate: '2026-09-02', docId: '1' }),
  tx({ ticker: 'ZZZ', tradeDate: '2026-09-01', publishedDate: '2026-09-09', docId: '2' }),
  tx({ ticker: 'ZZZ', tradeDate: '2026-09-01', publishedDate: '2026-09-09', docId: '3', account: 'andere rekening' })
]);
assert.equal(d.kept.length, 2); assert.equal(d.removed, 1);

// parser op echte regelindelingen (tekst uit gepubliceerde PTR's)
const raw = 'Name:| |Hon. Robert J. Wittman||Status:| |Member||ID| |Owner| |Asset| |Transaction|Type|Date| |Notification|Date|Amount| |Cap.|Gains >|$200?||' +
  'SP| |State Street Corporation Common|Stock (STT) [ST]|S (partial)| |05/18/2026| |05/18/2026| |$15,001 -|$50,000||F      S     : New|S          O : Fidelity Brokerage - MG|D          : RSU||' +
  'NVIDIA Corporation - Common Stock|(NVDA) [ST]|P| |06/26/2026| |06/26/2026| |$1,001 - $15,000||F      S     : New|S          O : Morgan Stanley - E*TRADE IRA||' +
  'U.S Treasury Bills [GS]| |P| |12/29/2025| |12/31/2025| |$100,001 -|$250,000||F      S     : New||';
const p = parsePtr(raw);
assert.equal(p.member, 'Robert J. Wittman');
assert.equal(p.rows.length, 3);
assert.deepEqual([p.rows[0].owner, p.rows[0].ticker, p.rows[0].type, p.rows[0].partial], ['SP', 'STT', 'S', true]);
assert.deepEqual([p.rows[1].ticker, p.rows[1].assetType, p.rows[1].tradeDate, p.rows[1].amountRange, p.rows[1].account], ['NVDA', 'ST', '2026-06-26', '$1,001 - $15,000', 'Morgan Stanley - E*TRADE IRA']);
assert.equal(p.rows[2].ticker, null); assert.equal(p.rows[2].assetType, 'GS');
assert.equal(cleanName('NVIDIA Corporation - Common Stock'), 'NVIDIA Corporation');
assert.equal(cleanName('State Street Corporation Common Stock'), 'State Street Corporation');
console.log('Alle tests geslaagd.');
