// Congress Buys — eigen berekening (Scriptable-widget)
// Toont de 2 grootste posities uit latest.json. GEEN officiële Quiver-ranglijst.
// Zet hieronder je eigen adres. Tot dat is ingevuld toont de widget alleen een melding, nooit voorbeelddata.

const DATA_URL = "https://leonprnd.github.io/congress-buys-tracker/latest.json";
const MAX_AGE_HOURS = 96;      // ouder dan dit = "verouderd"

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "congress-buys-cache.json");

async function load() {
  let cache = null;
  if (fm.fileExists(CACHE)) { try { cache = JSON.parse(fm.readString(CACHE)); } catch (e) {} }
  if (DATA_URL.includes("JOUW-GEBRUIKERSNAAM")) return { cache: null, error: "Adres nog niet ingesteld" };
  try {
    const req = new Request(DATA_URL + "?t=" + Date.now());
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (!data || data.schema !== 1 || !data.asOf) throw new Error("Onverwacht formaat");
    cache = { data, checkedAt: new Date().toISOString() };   // laatste GESLAAGDE controle
    fm.writeString(CACHE, JSON.stringify(cache));
    return { cache, error: null };
  } catch (e) {
    return { cache, error: "Ophalen mislukt" };
  }
}

const pct = w => (w * 100).toFixed(1).replace(".", ",") + "%";
const dm = iso => { const d = new Date(iso); return d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear(); };
const dt = iso => { const d = new Date(iso); return d.getDate() + "-" + (d.getMonth() + 1) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

function warningsOf(cache, error) {
  const w = [];
  if (error) w.push(error + (cache ? " — oude gegevens" : ""));
  if (cache) {
    const d = cache.data;
    const ageH = (Date.now() - new Date(d.generatedAt).getTime()) / 36e5;
    if (ageH > MAX_AGE_HOURS) w.push("Verouderd (" + Math.round(ageH / 24) + " dgn)");
    if (!d.coverage.senaat) w.push("Senaat ontbreekt");
    if (d.warnings.some(x => /konden niet gelezen/.test(x))) w.push("Onvolledig");
    if (d.top2.length < 2) w.push("Minder dan 2 posities");
  }
  return w;
}

async function build() {
  const { cache, error } = await load();
  const w = new ListWidget();
  w.backgroundColor = new Color("#14181f");
  w.url = cache ? cache.data.detailUrl : undefined;
  w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);   // verzoek, geen garantie van iOS

  const head = w.addText(cache ? "Eigen berekening · Congress Buys" : "Congress Buys");
  head.font = Font.semiboldSystemFont(11); head.textColor = new Color("#8fa1b8");

  if (!cache) {
    w.addSpacer(6);
    const t = w.addText(error || "Geen gegevens");
    t.font = Font.boldSystemFont(14); t.textColor = new Color("#ff8a80");
    const s = w.addText("Er zijn geen gegevens bewaard. Er wordt niets getoond dat niet echt is.");
    s.font = Font.systemFont(10); s.textColor = new Color("#8fa1b8");
    return w;
  }

  const d = cache.data;
  w.addSpacer(4);
  if (d.top2.length === 0) {
    const t = w.addText("Geen posities berekend"); t.font = Font.boldSystemFont(14); t.textColor = Color.white();
  }
  for (const p of d.top2) {
    const row = w.addStack(); row.centerAlignContent();
    const l = row.addText(p.ticker); l.font = Font.boldSystemFont(17); l.textColor = Color.white();
    row.addSpacer(6);
    const n = row.addText(p.company); n.font = Font.systemFont(11); n.textColor = new Color("#c5d0de"); n.lineLimit = 1;
    row.addSpacer();
    const g = row.addText(pct(p.weight)); g.font = Font.boldSystemFont(17); g.textColor = new Color("#7dd3a8");
    w.addSpacer(2);
  }
  w.addSpacer();

  const warn = warningsOf(cache, error);
  if (warn.length) {
    const t = w.addText("⚠ " + warn.join(" · ")); t.font = Font.semiboldSystemFont(10); t.textColor = new Color("#ffb454");
  }
  const f = w.addText("Peildatum " + dm(d.asOf) + " · gecontroleerd " + dt(cache.checkedAt));
  f.font = Font.systemFont(9); f.textColor = new Color("#8fa1b8");
  const f2 = w.addText("Geen officiële Quiver-lijst");
  f2.font = Font.systemFont(9); f2.textColor = new Color("#8fa1b8");
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
