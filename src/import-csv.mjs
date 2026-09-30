// Handmatige import: zet CSV-bestanden in de map import/ (bijv. een export uit je Premium-account
// of eigen Senaat-gegevens). Kolomnamen zijn flexibel; zie README.
import fs from 'fs';
import path from 'path';

const ALIAS = {
  ticker: ['ticker', 'symbol'],
  member: ['member', 'representative', 'politician', 'name'],
  company: ['company', 'asset', 'assetname', 'description'],
  type: ['transaction', 'type', 'transactiontype'],
  tradeDate: ['tradedate', 'traded', 'transactiondate', 'transaction date'],
  publishedDate: ['reportdate', 'filed', 'published', 'publisheddate', 'disclosuredate', 'report date'],
  amount: ['range', 'amount', 'trade_size_usd', 'size'],
  chamber: ['chamber', 'house'],
  owner: ['owner']
};

function splitCsv(line, sep) {
  const out = []; let cur = '', q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === sep && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const toIso = s => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

export function loadImports(dir) {
  const rows = [], warnings = [];
  if (!fs.existsSync(dir)) return { rows, warnings };
  for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;
    const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
    const head = splitCsv(lines[0], sep).map(h => h.toLowerCase().replace(/[\s_]/g, ''));
    const col = {};
    for (const [k, names] of Object.entries(ALIAS)) col[k] = head.findIndex(h => names.map(n => n.replace(/[\s_]/g, '')).includes(h));
    const missing = ['ticker', 'type', 'tradeDate', 'publishedDate', 'amount'].filter(k => col[k] < 0);
    if (missing.length) { warnings.push(`${f}: kolom(men) ontbreken: ${missing.join(', ')} — bestand overgeslagen.`); continue; }
    let bad = 0;
    lines.slice(1).forEach((line, i) => {
      const c = splitCsv(line, sep), g = k => (col[k] >= 0 ? c[col[k]] || '' : '');
      const tradeDate = toIso(g('tradeDate')), publishedDate = toIso(g('publishedDate'));
      const type = /purchase|buy|^p$/i.test(g('type')) ? 'P' : /sale|sell|^s/i.test(g('type')) ? 'S' : g('type');
      const ch = g('chamber').toLowerCase();
      const chamber = /sen/.test(ch) ? 'Senaat' : /house|huis|rep/.test(ch) ? 'Huis' : 'Import';
      let amountRange = g('amount');
      if (/^\d+(\.\d+)?$/.test(amountRange)) amountRange = `$${amountRange} - $${amountRange}`; // los bedrag
      if (!g('ticker') || !tradeDate || !publishedDate) { bad++; return; }
      rows.push({
        chamber, docId: `import:${f}:${i}`, row: i, member: g('member'), owner: g('owner') || 'Lid', account: '',
        ticker: g('ticker').toUpperCase(), assetName: g('company') || g('ticker'), assetType: 'ST', type,
        tradeDate, publishedDate, notificationDate: publishedDate, amountRange, source: `import/${f}`
      });
    });
    if (bad) warnings.push(`${f}: ${bad} rij(en) zonder ticker of geldige datum overgeslagen.`);
  }
  return { rows, warnings };
}
