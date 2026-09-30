// Rekenkern: transacties -> gewichten. Geen bestands- of netwerktoegang, dus goed testbaar.

export function parseRange(s) {
  const over = s.match(/Over \$([\d,]+)/);
  if (over) { const v = +over[1].replace(/,/g, ''); return { low: v, high: v }; }
  const m = s.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
  if (!m) return null;
  return { low: +m[1].replace(/,/g, ''), high: +m[2].replace(/,/g, '') };
}

export function amountOf(range, mapping) {
  const r = typeof range === 'string' ? parseRange(range) : range;
  if (!r) return null;
  if (mapping === 'low') return r.low;
  if (mapping === 'high') return r.high;
  return (r.low + r.high) / 2;
}

const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

// Dubbel = zelfde lid, eigenaar, rekening, waarde, datum, type en bedrag. Bij dubbele meldingen
// (bijv. een gecorrigeerde melding) wint de laatst gepubliceerde; de rest telt niet mee.
export function dedupe(txs) {
  const best = new Map();
  for (const t of txs) {
    const k = [t.member, t.owner, t.account, t.ticker, t.type, t.tradeDate, t.amountRange].join('|');
    const cur = best.get(k);
    if (!cur || t.publishedDate > cur.publishedDate || (t.publishedDate === cur.publishedDate && t.docId > cur.docId)) best.set(k, t);
  }
  return { kept: [...best.values()], removed: txs.length - best.size };
}

// Verdeel gewicht met plafond. Overschot gaat naar de rest, naar rato van hun gewicht (herhaald).
export function capWeights(base, cap) {
  const tickers = Object.keys(base);
  if (!tickers.length) return {};
  if (cap * tickers.length < 1 - 1e-9) return { ...base, __capInfeasible: 1 };
  const w = { ...base };
  const fixed = new Set();
  for (let i = 0; i < tickers.length + 1; i++) {
    const over = tickers.filter(t => !fixed.has(t) && w[t] > cap + 1e-12);
    if (!over.length) break;
    over.forEach(t => { w[t] = cap; fixed.add(t); });
    const free = tickers.filter(t => !fixed.has(t));
    const freeBase = free.reduce((s, t) => s + base[t], 0);
    const remaining = 1 - fixed.size * cap;
    free.forEach(t => { w[t] = freeBase ? (base[t] / freeBase) * remaining : remaining / free.length; });
  }
  return w;
}

export function compute(txs, opt, asOf) {
  const { windowDays, amountMapping, assetTypes, transactionTypes, maxWeight, minTickers = 0 } = opt;
  const from = addDays(asOf, -windowDays);
  const eligible = txs.filter(t =>
    t.publishedDate <= asOf &&                       // alleen wat toen bekend was
    t.tradeDate > from && t.tradeDate <= asOf &&     // venster op transactiedatum
    transactionTypes.includes(t.type) &&
    (!t.assetType || assetTypes.includes(t.assetType)) &&
    t.ticker);
  const { kept, removed } = dedupe(eligible);
  const amounts = {}, names = {}, counts = {};
  let skippedNoAmount = 0;
  for (const t of kept) {
    const a = amountOf(t.amountRange, amountMapping);
    if (a == null) { skippedNoAmount++; continue; }
    amounts[t.ticker] = (amounts[t.ticker] || 0) + a;
    counts[t.ticker] = (counts[t.ticker] || 0) + 1;
    (names[t.ticker] ||= {})[t.assetName] = (names[t.ticker][t.assetName] || 0) + 1;
  }
  let tickers = Object.keys(amounts).sort((a, b) => amounts[b] - amounts[a]);
  const total = tickers.reduce((s, t) => s + amounts[t], 0);
  const base = Object.fromEntries(tickers.map(t => [t, amounts[t] / total]));
  const capped = capWeights(base, maxWeight);
  const capInfeasible = !!capped.__capInfeasible;
  delete capped.__capInfeasible;
  const positions = tickers.map(t => ({
    ticker: t,
    company: cleanName(Object.entries(names[t]).sort((a, b) => b[1] - a[1])[0][0]),
    weight: capped[t], baseWeight: base[t], amount: amounts[t], transactions: counts[t]
  })).sort((a, b) => b.weight - a.weight || b.amount - a.amount);
  return {
    asOf, windowFrom: from, positions,
    totalAmount: total || 0, tickerCount: tickers.length, transactionCount: kept.length,
    duplicatesRemoved: removed, skippedNoAmount, capInfeasible,
    belowMinTickers: tickers.length < minTickers,
    latestPublished: kept.map(t => t.publishedDate).sort().pop() || null,
    latestTrade: kept.map(t => t.tradeDate).sort().pop() || null
  };
}

export function cleanName(n) {
  return n.replace(/\s+-\s+.*$/, '').replace(/\s+(Common Stock|Ordinary Shares|Class [A-C]( Common Stock)?|Common Shares|ADR|American Depositary.*)$/i, '').replace(/,\s*$/, '').trim();
}

// Hoe stabiel is de top 2 bij andere (onbekende) parameters?
export function sensitivity(txs, opt, asOf) {
  const out = [];
  for (const windowDays of opt.sensitivity.windowDays)
    for (const amountMapping of opt.sensitivity.amountMapping) {
      const r = compute(txs, { ...opt, windowDays, amountMapping }, asOf);
      out.push({ windowDays, amountMapping, top2: r.positions.slice(0, 2).map(p => p.ticker) });
    }
  return out;
}
