import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const OUT = '/Users/kevin/PROJECTS/pwayment RETAIL/presentation-build/pwayment-talemate-investor-rebuild.pptx';
const PREVIEW = '/Users/kevin/PROJECTS/pwayment RETAIL/presentation-build/investor-rebuild-previews';

const W = 1280;
const H = 720;
const C = {
  ink: '#101216',
  muted: '#5F6875',
  soft: '#F3F5F7',
  line: '#D6DCE3',
  blue: '#287EF0',
  bluePale: '#E8F2FF',
  cyan: '#6CC8EF',
  green: '#2D9B70',
  orange: '#F59E0B',
  red: '#D85A5A',
  white: '#FFFFFF',
};

const page = { left: 52, right: 1228, top: 42, bottom: 666 };

function addText(slide, text, x, y, w, h, style = {}) {
  const box = slide.shapes.add({
    geometry: 'textbox',
    position: { left: x, top: y, width: w, height: h },
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  });
  box.text = text;
  box.text.style = {
    typeface: 'Helvetica Neue',
    color: C.ink,
    fontSize: 18,
    alignment: 'left',
    verticalAlignment: 'top',
    autoFit: 'shrinkText',
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    ...style,
  };
  return box;
}

function rect(slide, x, y, w, h, fill, line = 'none', radius = 'rounded-xl') {
  return slide.shapes.add({
    geometry: radius === 'square' ? 'rect' : 'roundRect',
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 },
    ...(radius === 'square' ? {} : { borderRadius: radius }),
  });
}

function rule(slide, x, y, w, color = C.line, h = 1) {
  return rect(slide, x, y, w, h, color, 'none', 'square');
}

function dot(slide, x, y, size, fill) {
  return slide.shapes.add({
    geometry: 'ellipse',
    position: { left: x, top: y, width: size, height: size },
    fill,
    line: { style: 'solid', fill, width: 0 },
  });
}

function footer(slide, n, label = 'PWAYMENT  /  TALemate RETAIL PILOT') {
  addText(slide, label.toUpperCase(), 52, 681, 620, 18, { fontSize: 10, bold: true, color: C.muted, letterSpacing: 0.6 });
  addText(slide, String(n).padStart(2, '0'), 1176, 681, 52, 18, { fontSize: 11, bold: true, color: C.muted, alignment: 'right' });
}

function title(slide, text, kicker, n, opts = {}) {
  if (kicker) addText(slide, kicker.toUpperCase(), page.left, page.top, 650, 22, { fontSize: 12, bold: true, color: C.blue, letterSpacing: 1.2 });
  addText(slide, text, page.left, page.top + 36, opts.width ?? 1140, opts.height ?? 84, { fontSize: opts.fontSize ?? 37, bold: true, color: opts.color ?? C.ink });
  footer(slide, n, opts.footer ?? 'Pwayment  /  Talemate retail pilot');
}

function notes(slide, text) {
  slide.speakerNotes.textFrame.setText(text);
  slide.speakerNotes.setVisible(true);
}

function newSlide(presentation, bg = C.white) {
  const slide = presentation.slides.add();
  slide.background.fill = bg;
  return slide;
}

function label(slide, text, x, y, color = C.blue) {
  addText(slide, text.toUpperCase(), x, y, 260, 20, { fontSize: 12, bold: true, color, letterSpacing: 1.1 });
}

function numberCircle(slide, n, x, y, fill = C.blue, size = 46) {
  dot(slide, x, y, size, fill);
  addText(slide, String(n).padStart(2, '0'), x + 11, y + 13, size - 22, 20, { fontSize: 13, bold: true, color: C.white, alignment: 'center' });
}

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

async function main() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 1 — The meeting proposition
  {
    const s = newSlide(p);
    addText(s, 'PWAYMENT', 52, 42, 300, 28, { fontSize: 15, bold: true, color: C.blue, letterSpacing: 2 });
    addText(s, 'Van kassa\nnaar beslissing.', 52, 156, 760, 160, { fontSize: 64, bold: true });
    addText(s, 'Een concrete retailpilot voor Oostende —\ngebouwd met Talemate.', 56, 350, 700, 72, { fontSize: 27, color: C.muted });
    rect(s, 858, 148, 316, 316, C.blue, 'none', 'rounded-2xl');
    label(s, 'Donderdag wil ik beslissen', 894, 188, C.white);
    addText(s, 'Pwayment\n×\nTALEMATE', 894, 238, 242, 150, { fontSize: 34, bold: true, color: C.white });
    addText(s, 'van retaildata naar\nactie in de fysieke winkel', 894, 406, 242, 48, { fontSize: 16, color: '#EAF5FF' });
    addText(s, 'Investor / strategic partner discussion\nTALEMATE · Oostende · 06.08.2026', 56, 646, 500, 40, { fontSize: 13, color: C.muted });
    notes(s, 'Open met de concrete bedoeling van het gesprek. Geen claim dat Pwayment vandaag al een volledig intelligence-platform is; de deck maakt het verschil tussen bestaand product en voorgestelde pilot expliciet.');
  }

  // 2 — Honest status
  {
    const s = newSlide(p);
    title(s, 'De eerlijke startpositie maakt de kans groter.', '01  /  uitgangspositie', 2);
    addText(s, 'Pwayment is vandaag geen universeel AI-platform.\nHet is een werkende POS-basis met een duidelijke volgende laag.', 52, 166, 850, 80, { fontSize: 26, color: C.muted });
    rule(s, 52, 282, 1176, C.line, 1);
    rect(s, 52, 326, 512, 238, C.soft, 'none');
    label(s, 'Wat er vandaag ligt', 82, 356, C.blue);
    addText(s, 'Offline-first POS\nvoor Belgische retail', 82, 398, 390, 64, { fontSize: 30, bold: true });
    addText(s, 'Kassa · catalogus · voorraad · aankoopprijs\nverkoopprijs · Belgische btw · klanten · rapporten', 82, 488, 412, 54, { fontSize: 17, color: C.muted });
    rect(s, 664, 326, 564, 238, C.blue, 'none');
    label(s, 'Wat we samen bewijzen', 694, 356, C.white);
    addText(s, 'Retaildata wordt\nbruikbare actie.', 694, 398, 430, 64, { fontSize: 30, bold: true, color: C.white });
    addText(s, 'Niet méér schermen. Wel betere beslissingen\nover voorraad, marge en klantmomenten.', 694, 488, 440, 54, { fontSize: 17, color: '#EAF5FF' });
    notes(s, 'Deze slide bouwt vertrouwen op. De huidige productstatus is gebaseerd op de aanwezige Pwayment-codebase: offline-first POS, productbeheer, voorraad, Belgische btw, klanten, rapportage, audit en rollen. De intelligence-laag is een voorgestelde volgende fase.');
  }

  // 3 — What exists
  {
    const s = newSlide(p);
    title(s, 'Er staat al een bruikbare retailbasis.', '02  /  bewijs vandaag', 3);
    addText(s, 'De eerste versie lost het transactionele stuk op. Dat is de ingang naar intelligence.', 52, 160, 900, 34, { fontSize: 24, color: C.muted });
    const items = [
      ['01', 'Verkopen', 'Barcode / SKU, winkelmand, kortingen, betaalmethodes'],
      ['02', 'Beheren', 'Producten, categorieën, aankoopprijs, verkoopprijs, voorraad'],
      ['03', 'Verantwoorden', 'Belgische btw, dagrapport, hash-keten, auditlog'],
      ['04', 'Relatie bouwen', 'Klantenkaart, winkelhistoriek, cadeaubonnen, rollen'],
    ];
    const xs = [52, 348, 644, 940];
    items.forEach(([nr, head, body], i) => {
      rect(s, xs[i], 246, 260, 248, i === 0 ? C.bluePale : C.soft, 'none');
      addText(s, nr, xs[i] + 24, 272, 80, 28, { fontSize: 16, bold: true, color: C.blue });
      addText(s, head, xs[i] + 24, 326, 210, 34, { fontSize: 25, bold: true });
      addText(s, body, xs[i] + 24, 382, 210, 80, { fontSize: 16, color: C.muted });
    });
    addText(s, 'De ontbrekende stap: van “wat verkocht?” naar “wat moet de eigenaar nu doen?”', 52, 570, 1060, 36, { fontSize: 25, bold: true });
    notes(s, 'Product-capabilities zijn afgeleid uit de bestaande codebase en README. Geen externe marktclaims. Gebruik dit moment om kort een live demo of productvideo te tonen als die beschikbaar is.');
  }

  // 4 — concrete job to be done
  {
    const s = newSlide(p);
    title(s, 'De winkelier heeft geen dataprobleem. Hij heeft een beslisprobleem.', '03  /  de concrete job', 4);
    rect(s, 52, 176, 414, 342, C.soft, 'none');
    label(s, 'De vraag achter de kassa', 82, 210, C.red);
    addText(s, '“Ik zie wat er\ngebeurde.\nMaar waarom —\nen wat nu?”', 82, 258, 330, 160, { fontSize: 34, bold: true });
    addText(s, 'Elke week opnieuw: marge, voorraad, timing, klant en medewerker beïnvloeden elkaar.', 82, 452, 320, 46, { fontSize: 16, color: C.muted });
    // connectors first
    rule(s, 466, 342, 54, C.line, 3);
    rule(s, 748, 342, 4, C.line, 3);
    rule(s, 980, 342, 4, C.line, 3);
    const stages = [
      ['Signaal', 'Verkoop, retour, voorraad, korting', C.cyan],
      ['Inzicht', 'Oorzaak, prioriteit, kans', C.bluePale],
      ['Actie', 'Bestel, prijs aan, stop, contacteer', C.blue],
    ];
    stages.forEach(([head, body, fill], i) => {
      const x = 520 + i * 232;
      rect(s, x, 248, 228, 188, fill, 'none');
      addText(s, head, x + 24, 278, 180, 30, { fontSize: 24, bold: true, color: i === 2 ? C.white : C.ink });
      addText(s, body, x + 24, 338, 178, 68, { fontSize: 16, color: i === 2 ? '#EAF5FF' : C.muted });
    });
    addText(s, 'Dat is de wedge: de dagelijkse beslissing, niet het zoveelste dashboard.', 520, 494, 620, 58, { fontSize: 25, bold: true });
    notes(s, 'Gebruik één herkenbaar winkelverhaal. De formuleringen zijn producthypotheses, geen bewezen klantresultaten.');
  }

  // 5 — Talemate fit
  {
    const s = newSlide(p);
    title(s, 'Talemate maakt retaildata uitvoerbaar.', '04  /  waarom talemate', 5);
    addText(s, 'Pwayment brengt de retailcontext. Talemate kan die context verbinden met de fysieke wereld.', 52, 160, 1000, 34, { fontSize: 24, color: C.muted });
    // connectors first
    rule(s, 372, 350, 108, C.blue, 3);
    rule(s, 800, 350, 108, C.blue, 3);
    rect(s, 52, 250, 320, 210, C.soft, 'none');
    label(s, 'Pwayment', 82, 284, C.blue);
    addText(s, 'Retail events\nMetrics\nContext', 82, 332, 230, 110, { fontSize: 28, bold: true });
    rect(s, 480, 250, 320, 210, C.bluePale, 'none');
    label(s, 'De connector', 510, 284, C.blue);
    addText(s, 'API\nNo-code workflow\nCloud sync', 510, 332, 240, 110, { fontSize: 27, bold: true });
    rect(s, 908, 250, 320, 210, C.blue, 'none');
    label(s, 'Talemate', 938, 284, C.white);
    addText(s, 'Trigger\nWorkflow\nFysieke actie', 938, 332, 240, 110, { fontSize: 27, bold: true, color: C.white });
    rect(s, 52, 540, 1176, 72, C.ink, 'none');
    addText(s, 'Voorbeeld: slow mover gedetecteerd  →  taak naar medewerker  →  actie in de winkel  →  resultaat terug naar Pwayment.', 78, 564, 1124, 30, { fontSize: 18, bold: true, color: C.white });
    notes(s, '[Sources]\nTALEMATE platform one-pager: https://www.talemate.co/web/content/83385?unique=ff28d6f34da4da333f5fb15bacd61f7b7c1884a06\nTALEMATE contact/product overview: https://www.talemate.co/contact\nDe voorgestelde actiekring en retail-use-case zijn een interpretatie en voorstel, geen bestaande Talemate-integratie.');
  }

  // 6 — Pilot
  {
    const s = newSlide(p);
    title(s, 'Mijn voorstel: bewijs één retail-use-case in zes weken.', '05  /  het voorstel', 6);
    addText(s, 'Geen brede platformbelofte. Eén winkelprobleem, één connector, één meetbaar resultaat.', 52, 160, 1000, 34, { fontSize: 24, color: C.muted });
    const phases = [
      ['Week 1–2', 'Kiezen', 'Selecteer één Oostendse retailcase en definieer de succesmaatstaf.', C.cyan],
      ['Week 3–4', 'Verbinden', 'Koppel Pwayment-events aan één Talemate-workflow.', C.blue],
      ['Week 5–6', 'Bewijzen', 'Test met echte winkelhandelingen en leg de impact vast.', C.green],
    ];
    phases.forEach(([time, head, body, color], i) => {
      const x = 52 + i * 392;
      rect(s, x, 252, 360, 260, C.soft, 'none');
      numberCircle(s, i + 1, x + 28, 282, color, 48);
      addText(s, time, x + 96, 294, 180, 24, { fontSize: 14, bold: true, color: C.muted });
      addText(s, head, x + 28, 356, 280, 34, { fontSize: 28, bold: true });
      addText(s, body, x + 28, 414, 290, 62, { fontSize: 16, color: C.muted });
    });
    addText(s, 'Succes = een aantoonbaar betere beslissing, niet een mooiere demo.', 52, 568, 1000, 34, { fontSize: 25, bold: true });
    notes(s, 'De zes weken zijn een voorstel voor scoping, geen belofte op basis van reeds afgesproken planning. Vraag in de meeting welke pilotomgeving en succesmaatstaf haalbaar zijn.');
  }

  // 7 — Business and scale
  {
    const s = newSlide(p);
    title(s, 'De commerciële logica begint smal — en kan daarna verbreden.', '06  /  het bedrijf', 7);
    const rows = [
      ['Startpunt', 'Skateshops en gespecialiseerde retail', 'Sterke product/voorraad-context; Pwayment is daar al op gericht.'],
      ['Product', 'POS-basis + intelligence-laag', 'Van transacties naar aanbevelingen en workflows.'],
      ['Verdienmodel', 'Werkhypothese: software per winkel', 'Extra connector-/automation tier na bewezen waarde.'],
      ['Uitbreiding', 'Andere gespecialiseerde winkels', 'De retailkern blijft; verticale regels en workflows veranderen.'],
    ];
    addText(s, 'Wat we al weten', 52, 196, 300, 28, { fontSize: 20, bold: true, color: C.blue });
    addText(s, 'Wat we moeten bewijzen', 664, 196, 360, 28, { fontSize: 20, bold: true, color: C.blue });
    rows.forEach(([a, b, c], i) => {
      const y = 246 + i * 82;
      rule(s, 52, y + 64, 1176, C.line, 1);
      addText(s, a, 52, y, 170, 30, { fontSize: 17, bold: true });
      addText(s, b, 244, y, 350, 30, { fontSize: 18, bold: true });
      addText(s, c, 664, y, 520, 44, { fontSize: 17, color: C.muted });
    });
    rect(s, 52, 574, 1176, 42, C.bluePale, 'none');
    addText(s, 'Belangrijk: dit is een businessmodel-hypothese voor validatie, geen opgeblazen marktclaim.', 76, 586, 1120, 22, { fontSize: 16, bold: true });
    notes(s, 'De businessmodel-regel is bewust als werkhypothese gelabeld. Er zijn geen verzonnen TAM-, omzet- of klantcijfers opgenomen.');
  }

  // 8 — The ask
  {
    const s = newSlide(p);
    title(s, 'Donderdag wil ik geen compliment. Ik wil een volgende stap.', '07  /  de vraag', 8, { fontSize: 36 });
    addText(s, 'Mijn concrete vraag aan Talemate en de stad Oostende:', 52, 158, 900, 34, { fontSize: 25, color: C.muted });
    rect(s, 52, 232, 1176, 118, C.blue, 'none');
    addText(s, 'Geef ons de kans om één echte retail-use-case\nsamen te bewijzen.', 84, 262, 820, 72, { fontSize: 34, bold: true, color: C.white });
    const asks = [
      ['01', 'Talemate', 'Een technische discovery rond één connector en workflow.'],
      ['02', 'Oostende', 'Een realistische retailomgeving of pilotpartner om het probleem te testen.'],
      ['03', 'Samen', 'Een go/no-go-moment na de pilot voor verdere investering en schaal.'],
    ];
    asks.forEach(([nr, head, body], i) => {
      const x = 52 + i * 392;
      numberCircle(s, nr, x, 416, i === 1 ? C.orange : C.ink, 44);
      addText(s, head, x + 64, 420, 260, 28, { fontSize: 22, bold: true });
      addText(s, body, x + 64, 462, 280, 56, { fontSize: 16, color: C.muted });
    });
    notes(s, 'Dit is de kernvraag. Laat de zaal kiezen tussen: concrete pilot, technische discovery, of geen fit. De presentatie hoeft niet te eindigen met een vage uitnodiging.');
  }

  // 9 — close
  {
    const s = newSlide(p);
    addText(s, 'PWAYMENT', 52, 42, 300, 28, { fontSize: 15, bold: true, color: C.blue, letterSpacing: 2 });
    addText(s, 'De winkel genereert\nelke dag signalen.', 52, 170, 680, 120, { fontSize: 50, bold: true });
    addText(s, 'Pwayment maakt ze begrijpelijk.\nTalemate helpt ze uitvoerbaar maken.', 56, 350, 760, 82, { fontSize: 27, color: C.muted });
    rect(s, 858, 178, 316, 246, C.ink, 'none', 'rounded-2xl');
    label(s, 'De gezamenlijke kans', 892, 214, C.cyan);
    addText(s, 'Retaildata\n→ actie\n→ resultaat', 892, 268, 240, 124, { fontSize: 32, bold: true, color: C.white });
    addText(s, 'Welke use-case bouwen we als eerste?', 56, 570, 850, 38, { fontSize: 27, bold: true });
    addText(s, 'Pwayment × Talemate · Oostende · 06.08.2026', 56, 646, 700, 24, { fontSize: 15, color: C.muted });
    notes(s, 'Afsluiter: herhaal de concrete vraag en laat daarna stilte vallen. Geen extra slogan uitleggen.');
  }

  await fs.mkdir(PREVIEW, { recursive: true });
  for (const [i, slide] of p.slides.items.entries()) {
    const stem = `slide-${String(i + 1).padStart(2, '0')}`;
    await writeBlob(`${PREVIEW}/${stem}.png`, await p.export({ slide, format: 'png', scale: 1 }));
    await fs.writeFile(`${PREVIEW}/${stem}.layout.json`, await (await slide.export({ format: 'layout' })).text());
  }
  await writeBlob(`${PREVIEW}/montage.webp`, await p.export({ format: 'webp', montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(p);
  await pptx.save(OUT);
  console.log(OUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
