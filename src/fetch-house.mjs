// Haalt de officiële STOCK Act-meldingen (PTR) van het Huis van Afgevaardigden op.
// Bron: https://disclosures-clerk.house.gov/FinancialDisclosure (openbare bulkindex + pdf's).
import fs from 'fs';
import zlib from 'zlib';
import { pdfText, parsePtr } from './pdf-parse.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url)));
const FILE = new URL('../data/house.json', import.meta.url);
const UA = 'congress-buys-tracker/0.1 (persoonlijk gebruik)';
const store = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { docs: {}, transactions: [] };

async function get(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status === 404) return null;
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      if (i === tries) throw e;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

// Minimale zip-lezer (deflate), zodat er geen extra pakket nodig is.
function unzipEntry(buf, wanted) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let off = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nl);
    if (name === wanted) {
      const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
      const data = buf.subarray(ds, ds + csize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('Niet in zip: ' + wanted);
}

const usDate = s => { const [m, d, y] = s.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const cutoff = new Date(Date.now() - cfg.fetchLookbackDays * 864e5).toISOString().slice(0, 10);
const year = new Date().getFullYear();
const filings = [];
for (const y of [year, year - 1]) {
  const zip = await get(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${y}FD.zip`);
  if (!zip) continue;
  const xml = unzipEntry(zip, `${y}FD.xml`).toString('utf8');
  for (const b of xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)) {
    const f = k => (b[1].match(new RegExp(`<${k}>([^<]*)</${k}>`)) || [])[1]?.trim();
    if (f('FilingType') !== 'P') continue;
    const filingDate = usDate(f('FilingDate'));
    if (filingDate >= cutoff) filings.push({ docId: f('DocID'), year: y, filingDate, indexName: `${f('First')} ${f('Last')}`, state: f('StateDst') });
  }
}
console.log(`${filings.length} PTR-meldingen sinds ${cutoff} in de index`);

const todo = filings.filter(f => !['ok', 'noRows'].includes(store.docs[f.docId]?.status));
console.log(`${todo.length} nog te verwerken`);
let done = 0;
async function work(f) {
  try {
    const buf = await get(`https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.year}/${f.docId}.pdf`);
    if (!buf) { store.docs[f.docId] = { ...f, status: 'error', error: '404' }; return; }
    const raw = await pdfText(buf);
    if (raw.replace(/[|\s]/g, '').length < 200) { store.docs[f.docId] = { ...f, status: 'noText' }; return; }
    const { member, rows } = parsePtr(raw);
    store.transactions = store.transactions.filter(t => t.docId !== f.docId);
    rows.forEach((r, i) => store.transactions.push({
      chamber: 'Huis', docId: f.docId, row: i, member: member || f.indexName, publishedDate: f.filingDate,
      source: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.year}/${f.docId}.pdf`, ...r
    }));
    store.docs[f.docId] = { ...f, member, status: rows.length ? 'ok' : 'noRows', rows: rows.length };
  } catch (e) {
    store.docs[f.docId] = { ...f, status: 'error', error: String(e.message).slice(0, 100) };
  }
  if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
}
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) { await work(queue.shift()); await new Promise(r => setTimeout(r, 150)); }
}));

store.indexCheckedAt = new Date().toISOString();
store.lastIndexFilingDate = filings.map(f => f.filingDate).sort().pop() || null;
const bad = Object.values(store.docs).filter(d => d.filingDate >= cutoff && ['error', 'noText'].includes(d.status));
store.problemDocs = bad.map(d => ({ docId: d.docId, status: d.status, filingDate: d.filingDate }));
fs.writeFileSync(FILE, JSON.stringify(store));
console.log(`Klaar. Transacties: ${store.transactions.length}. Problematische meldingen: ${bad.length}`);
if (filings.length === 0) { console.error('Index leeg — bron mogelijk gewijzigd.'); process.exit(1); }
