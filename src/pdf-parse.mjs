// Leest de tekst uit een House-PTR-pdf en haalt de transactieregels eruit.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

export async function pdfText(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  let s = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    s += t.items.map(x => x.str).join('|') + '\n';
  }
  return s;
}

const D = '(\\d{2}/\\d{2}/\\d{4})';
const ROW = new RegExp(
  '(?:^|\\s)(?:(SP|DC|JT)\\s+)?' +
  '([^\\[]+?)\\s*\\[([A-Z]{2})\\]\\s+' +
  '(P|S \\(partial\\)|S|E)\\s+' + D + '\\s+' + D + '\\s+' +
  '(Over \\$[\\d,]+|\\$[\\d,]+\\s*-\\s*\\$[\\d,]+)');
const HEADER = /^.*Cap\.\s*Gains\s*>\s*\$200\?\s*/;

export function parsePtr(raw) {
  const memberM = raw.match(/Name:[|\s]*(?:Hon\.\s*)?([^|]+)/);
  const member = memberM ? memberM[1].trim() : null;
  // Rijen en hun toelichting (rekening, opmerking) staan in blokken gescheiden door '||'.
  const blocks = raw.split('||').map(b => b.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim());
  const rows = [];
  for (const blk of blocks) {
    if (blk.startsWith('* For the complete list')) break;
    const m = ROW.exec(blk);
    if (m) {
      let name = m[2].trim().replace(HEADER, '');
      let owner = m[1];
      const lead = name.match(/^(SP|DC|JT)\s+/);
      if (lead) { owner = lead[1]; name = name.slice(lead[0].length); }
      let ticker = null;
      const t = name.match(/\(([A-Z][A-Z0-9.\-$]{0,9})\)\s*$/);
      if (t) { ticker = t[1]; name = name.slice(0, t.index).trim(); }
      rows.push({
        owner: owner || 'Lid', assetName: name, ticker, assetType: m[3],
        type: m[4].startsWith('S') ? 'S' : m[4], partial: m[4].includes('partial'),
        tradeDate: iso(m[5]), notificationDate: iso(m[6]), amountRange: m[7].replace(/\s+/g, ' '), account: ''
      });
    } else if (rows.length) {
      const acct = blk.match(/S\s*O\s*:\s*(.+?)(?=\s+[DCL]\s*:|$)/);
      if (acct && !rows[rows.length - 1].account) rows[rows.length - 1].account = acct[1].trim().slice(0, 80);
    }
  }
  return { member, rows };
}
const iso = d => `${d.slice(6)}-${d.slice(0, 2)}-${d.slice(3, 5)}`;
