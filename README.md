# Congress Buys — eigen tracker met iPhone-widget

**Geen officiële Quiver-ranglijst.** Dit is een transparante eigen benadering op basis van officiële STOCK Act-meldingen. Geen handel, alleen weergave.

## 1. Haalbaarheidsoordeel (onderzocht 30 sep 2026)

| Onderdeel | Oordeel |
|---|---|
| Exacte replicatie van Quiver | **Niet mogelijk.** Venster, bedragsomrekening, selectie en de exacte herverdeling boven 50% zijn niet openbaar. |
| Automatische bron zonder Quiver | **Deels.** Huis: officiële bulkindex + pdf's, gratis, gebouwd. Senaat: niet gebouwd (zie hieronder). |
| Automatische bron ná Premium via Quiver | **Kost geld.** Quiver-API begint bij $25–30/maand (Hobbyist, alleen niet-commercieel). Er is geen gratis laag, en dat Premium de API omvat is niet aangetoond. Ik heb niets omzeild. |
| Scriptable-widget | **Ja, eenvoudigste route.** Gratis app, kan JSON ophalen, bewaart laatste gegevens en toont een link. |
| Exacte achtergrondfrequentie | iOS bepaalt dat. De widget vraagt ongeveer elk uur om een verversing; er is geen garantie. |

### Regels van Quiver: bevestigd / afgeleid / onbekend

**Bevestigd** (Quiver-strategiepagina en versiegeschiedenis):
- Doel: aandelen die Congresleden (of familie) kochten, gewogen naar de *gerapporteerde omvang van de aankopen*.
- Wekelijkse herbalancering (sinds 2 sep 2022; daarvoor dagelijks).
- Het voortschrijdende venster werkt op **transactiedatum**, niet meldingsdatum, om invloed van na de 45-dagentermijn gemelde trades weg te nemen. Volgens een zoekresultaat wordt de meldingsdatum nog wel gebruikt als filter tegen vooruitkijken in de backtest.
- Maximaal 50% per aandeel (sinds 10 juli 2024).

**Afgeleid, niet bevestigd:**
- Een aankoop telt pas mee zodra hij gepubliceerd is (volgt uit het "vooruitkijken"-filter).
- Een zoekresultaat noemt een update van oktober 2024 ("venster wordt verlengd tot minstens 5 verschillende aandelen"). In de versiegeschiedenis die ik ophaalde stond die niet bij Congress Buys, wel bij andere Congress-strategieën. Daarom **niet** overgenomen.

**Onbekend** (mijn standaardwaarden in `config.json` zijn aannames):
1. Lengte van het venster (standaard 90 dagen). De 45 dagen zijn de meldtermijn, niet het venster.
2. Bedrag per categorie (standaard midden van de categorie; `low`/`high` ook mogelijk).
3. Welke assets tellen: standaard alleen aandelen (`ST`). Opties, obligaties, fondsen en ETF's zijn uitgesloten. Familiehandelingen (echtgenoot, kind, gezamenlijk) tellen mee, omdat Quiver "of familie" noemt.
4. Selectie van posities en de precieze herverdeling boven 50% (hier: overschot naar rato over de rest, herhaald tot niets meer boven de limiet zit).
5. Of de getoonde wegingen doelgewichten bij herbalancering zijn of actuele marktgewichten. Deze tracker toont **doelgewichten uit de aankoopbedragen**, geen marktwaarde.

De parameters zijn dus niet gekozen om een bepaalde top twee te reproduceren. Het bestand `docs/latest.json` bevat `stability`: in hoeveel van 15 parametervarianten (venster 30–180 dagen × bedrag laag/midden/hoog) dezelfde top twee ontstaat. Is dat laag, vertrouw de top twee dan minder. De grootste positie is bovendien niet automatisch de beste belegging.

## 2. Bekende beperkingen (eerlijk)

- **Senaat ontbreekt.** De Senaat-database (efdsearch.senate.gov) vraagt een akkoord en sessie en biedt geen bulkbestand; automatisch scrapen laat ik achterwege. Bekende gratis Senaat-dumps zijn verouderd. Widget en pagina tonen daarom altijd "Senaat ontbreekt", tenzij je Senaatsrijen importeert (zie 5).
- Ongeveer 40 recente House-meldingen zijn gescande pdf's zonder tekst. Die worden **niet** gelezen; de aantallen staan onder `warnings`.
- Optie-uitoefeningen kunnen als aandelenaankoop verschijnen (gezien bij één grote melding). Of Quiver dat ook telt is onbekend.
- Dubbele meldingen: identieke rijen (lid, eigenaar, rekening, aandeel, datum, bedrag) worden één keer geteld; bij een gecorrigeerde melding wint de laatste. Twee echt identieke aankopen op dezelfde rekening dezelfde dag zouden ten onrechte samenvallen.
- Bedragen zijn categorieën, geen exacte bedragen; "Over $50.000.000" telt als $50 mln.
- Je gebruikt dit voor eigen gebruik. De wet (STOCK Act) verbiedt gebruik van deze gegevens voor commerciële doeleinden of om geld/steun te werven; deel of verkoop de uitkomst dus niet.

## 3. Wat er in zit

```
config.json            alle aannames, aan te passen
src/fetch-house.mjs    haalt Huis-index + pdf's op (incrementeel, cache in data/house.json)
src/pdf-parse.mjs      leest transacties uit een pdf
src/engine.mjs         weging, plafond, venster, dubbelen, gevoeligheid
src/compute.mjs        schrijft docs/latest.json
src/import-csv.mjs     handmatige import uit import/*.csv
src/test.mjs           tests (verzonnen invoer, komt nooit in de uitvoer)
docs/index.html        detailpagina (tikbare link vanuit de widget)
widget/CongressBuys.js Scriptable-widget
.github/workflows/     dagelijkse automatische update (gratis)
```

Kosten: **€ 0** (GitHub gratis, Scriptable gratis). Onderhoud: kijk af en toe of de workflow nog slaagt; het pdf-formaat van het Huis kan wijzigen (dan meldt de workflow een fout of komt er "Onvolledig" in de widget).

## 4. Installeren (Nederlands, stap voor stap)

**Op de pc (proberen):**
```bash
npm install
npm test
npm run update
```
Daarna staat de uitkomst in `docs/latest.json`.

**Online zetten (gratis):**
1. Maak op github.com een **openbare** repository `congress-buys-tracker` (openbaar is nodig voor gratis GitHub Pages; de data komt uit openbare bronnen).
2. Upload de inhoud van deze map (zonder `node_modules`) en `git push`.
3. Repository → Settings → Pages → Branch `main`, map `/docs`.
4. Repository → Actions → "Dagelijkse update" → Run workflow. Controleer dat hij slaagt.
5. Je adres wordt `https://JOUWNAAM.github.io/congress-buys-tracker/latest.json`.

**Widget op de iPhone:**
1. Installeer **Scriptable** uit de App Store (gratis).
2. Maak een nieuw script, plak de inhoud van `widget/CongressBuys.js` en zet bovenaan je adres bij `DATA_URL`.
3. Druk op afspelen om te testen.
4. Beginscherm → lang indrukken → **+** → Scriptable → **Medium** → Widget bewerken → kies het script.
5. Tik op de widget om de detailpagina te openen.

De widget toont: bedrijfsnaam, ticker, weging, "Eigen berekening", peildatum, tijdstip van de laatste geslaagde controle, en waarschuwingen (verouderd na 4 dagen, Senaat ontbreekt, onvolledig, ophalen mislukt). Bij een storing blijven de laatst geslaagde gegevens staan, met melding. Zonder ooit geslaagde download toont hij alleen een foutmelding, nooit voorbeelddata.

## 5. Handmatige import (Premium-export of Senaat)

Zet een `.csv` in `import/`. Vereiste kolommen (hoofdletters en spaties maken niet uit): `Ticker`, `Transaction` (Purchase/Sale), `TradeDate`, `ReportDate`, `Range` (bijv. `$1,001 - $15,000` of een los bedrag). Optioneel: `Member`, `Company`, `Chamber` (`Senate`/`House`), `Owner`. Datums als `2026-09-01` of `09/01/2026`. Draai daarna `npm run compute`.
- Rijen met `Chamber=Senate` worden **toegevoegd** aan de House-gegevens.
- Rijen met `Chamber=House` **vervangen** de automatisch opgehaalde House-gegevens.
- Zonder `Chamber` vallen ze onder "Import" en komen ze erbij; pas op voor dubbel tellen.

**Kalibreren met Premium:** lever vóór 14 oktober 2026 screenshots of exports van de Congress Buys-holdings op meerdere datums. Met `node src/compute.mjs --asof=JJJJ-MM-DD --stdout` reken ik dan terug naar die datums en toets ik venster en bedragsomrekening objectief, in plaats van ze te kiezen om één top twee te treffen.
