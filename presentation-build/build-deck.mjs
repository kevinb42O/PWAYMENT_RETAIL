import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const OUT = '/Users/kevin/PROJECTS/pwayment RETAIL/presentation-build/pwayment-talemate-retail-intelligence.pptx';
const PREVIEW = '/Users/kevin/PROJECTS/pwayment RETAIL/presentation-build/previews';

const W = 1280;
const H = 720;
const C = {
  ink: '#101216',
  muted: '#616872',
  pale: '#F2F4F6',
  line: '#D4D9DE',
  blue: '#3D8DFF',
  cyan: '#6DCBF4',
  bluePale: '#E8F3FF',
  green: '#2E9B6F',
  orange: '#F59E0B',
  white: '#FFFFFF',
  red: '#D65A5A',
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

function footer(slide, n, label = 'PWAYMENT  /  RETAIL INTELLIGENCE') {
  addText(slide, label, 52, 681, 520, 18, { fontSize: 11, bold: true, color: C.muted });
  addText(slide, String(n).padStart(2, '0'), 1176, 681, 52, 18, { fontSize: 11, bold: true, color: C.muted, alignment: 'right' });
}

function title(slide, text, kicker, n) {
  if (kicker) addText(slide, kicker.toUpperCase(), page.left, page.top, 600, 22, { fontSize: 12, bold: true, color: C.blue, letterSpacing: 1.2 });
  addText(slide, text, page.left, page.top + 36, 1130, 84, { fontSize: 38, bold: true, color: C.ink });
  footer(slide, n);
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

function addKpi(slide, x, y, w, value, label, delta, tone = C.blue) {
  rect(slide, x, y, w, 150, C.pale, 'none');
  addText(slide, value, x + 22, y + 22, w - 44, 48, { fontSize: 32, bold: true });
  addText(slide, label, x + 22, y + 76, w - 44, 24, { fontSize: 15, color: C.muted });
  addText(slide, delta, x + 22, y + 110, w - 44, 22, { fontSize: 14, bold: true, color: tone });
}

function addBullet(slide, x, y, w, head, body, color = C.blue) {
  dot(slide, x, y + 5, 10, color);
  addText(slide, head, x + 22, y, w - 22, 26, { fontSize: 20, bold: true });
  addText(slide, body, x + 22, y + 30, w - 22, 45, { fontSize: 16, color: C.muted });
}

async function main() {
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 1 — Cover
  {
    const s = newSlide(p);
    addText(s, 'PWAYMENT', 52, 42, 300, 28, { fontSize: 15, bold: true, color: C.blue, letterSpacing: 2 });
    addText(s, 'Retail intelligence\nstarting at the till.', 52, 186, 900, 170, { fontSize: 64, bold: true, color: C.ink });
    addText(s, 'Een universeel retailplatform dat van transactiedata\nbruikbare bedrijfsbeslissingen maakt.', 56, 410, 620, 72, { fontSize: 24, color: C.muted });
    rect(s, 860, 170, 300, 300, C.bluePale, 'none', 'rounded-2xl');
    rect(s, 908, 220, 204, 204, C.white, C.line, 'rounded-xl');
    addText(s, '€ 42.860', 932, 250, 160, 36, { fontSize: 28, bold: true });
    addText(s, 'omzet deze maand', 932, 292, 160, 22, { fontSize: 14, color: C.muted });
    rule(s, 932, 338, 155, C.line, 2);
    addText(s, 'Marge daalt 2,4 pp', 932, 356, 160, 24, { fontSize: 16, bold: true, color: C.red });
    addText(s, 'waarom?', 932, 386, 160, 22, { fontSize: 14, color: C.blue, bold: true });
    addText(s, 'Investor / strategic partner discussion\nTALEMATE · België · 06.08.2026', 56, 646, 500, 40, { fontSize: 13, color: C.muted });
    notes(s, 'Doel van de opening: Pwayment positioneren als meer dan een kassasysteem. De cijfers zijn illustratief demo-materiaal, geen klantresultaten.');
  }

  // 2 — Problem
  {
    const s = newSlide(p);
    title(s, 'De kassa registreert de waarheid — maar toont ze nog niet.', 'De kans', 2);
    addText(s, 'Retailsoftware vertelt vandaag vooral wat er verkocht is.\nDe eigenaar moet zelf uitzoeken waarom de resultaten veranderen.', 52, 166, 710, 76, { fontSize: 25, color: C.muted });
    rule(s, 52, 276, 1176, C.line, 1);
    addBullet(s, 68, 318, 340, 'Omzet is niet hetzelfde als winst.', 'Kortingen, retouren en productmix kunnen de marge stilletjes uithollen.', C.red);
    addBullet(s, 466, 318, 340, 'Voorraad is vastgezet kapitaal.', 'De eigenaar ziet vaak te laat welke producten al maanden niet bewegen.', C.orange);
    addBullet(s, 864, 318, 340, 'Rapporten zijn geen acties.', 'Een grafiek zegt niet automatisch wat morgen besteld, geprijsd of gestopt moet worden.', C.blue);
    addText(s, 'De volgende generatie retailsoftware moet niet méér data tonen.\nZe moet betere beslissingen uitlokken.', 52, 548, 940, 70, { fontSize: 28, bold: true });
    notes(s, 'Eigen analyse en producthypothese. Geen externe bron gebruikt.');
  }

  // 3 — Product promise
  {
    const s = newSlide(p);
    title(s, 'Pwayment maakt van verkoopdata een dagelijks actieplan.', 'De productbelofte', 3);
    addText(s, 'De eigenaar krijgt één helder antwoord op drie vragen:', 52, 160, 800, 36, { fontSize: 25, color: C.muted });
    rect(s, 52, 248, 348, 250, C.pale, 'none');
    addText(s, '01', 78, 278, 100, 36, { fontSize: 20, bold: true, color: C.blue });
    addText(s, 'Wat gebeurt er?', 78, 330, 270, 38, { fontSize: 28, bold: true });
    addText(s, 'Omzet, marge, voorraad, klanten en medewerkers — per dag, maand, jaar en locatie.', 78, 388, 270, 76, { fontSize: 17, color: C.muted });
    rect(s, 466, 248, 348, 250, C.pale, 'none');
    addText(s, '02', 492, 278, 100, 36, { fontSize: 20, bold: true, color: C.blue });
    addText(s, 'Waarom gebeurt het?', 492, 330, 290, 38, { fontSize: 28, bold: true });
    addText(s, 'Pwayment verbindt productmix, kortingen, stockouts, rotatie en klantgedrag.', 492, 388, 270, 76, { fontSize: 17, color: C.muted });
    rect(s, 880, 248, 348, 250, C.blue, 'none');
    addText(s, '03', 906, 278, 100, 36, { fontSize: 20, bold: true, color: C.white });
    addText(s, 'Wat moet ik doen?', 906, 330, 290, 38, { fontSize: 28, bold: true, color: C.white });
    addText(s, 'Bestel, prijs aan, stop, bundel, contacteer of plan — met reden en prioriteit.', 906, 388, 270, 76, { fontSize: 17, color: '#EAF5FF' });
    addText(s, 'Niet alleen een dashboard. Een retailbeslissingslaag.', 52, 565, 850, 42, { fontSize: 28, bold: true });
    notes(s, 'Eigen productvisie. Geen externe bron gebruikt.');
  }

  // 4 — Metrics
  {
    const s = newSlide(p);
    title(s, 'De eigenaar ziet maandelijks waar het geld zit.', 'Het insight cockpit', 4);
    addText(s, 'Illustratief maanddashboard · demo-data', 52, 146, 420, 24, { fontSize: 14, color: C.muted });
    addKpi(s, 52, 190, 260, '€ 42.860', 'Omzet', '+8,4% vs. vorige maand', C.green);
    addKpi(s, 334, 190, 260, '34,8%', 'Brutomarge', '-2,4 pp vs. vorige maand', C.red);
    addKpi(s, 616, 190, 260, '€ 18.420', 'Voorraadwaarde', '€ 6.120 > 90 dagen', C.orange);
    addKpi(s, 898, 190, 330, '€ 38,20', 'Gemiddeld ticket', '+5,1% vs. vorige maand', C.green);
    addText(s, 'Wat gebeurt er achter de KPI’s?', 52, 390, 520, 32, { fontSize: 24, bold: true });
    addBullet(s, 52, 448, 350, 'Margeverlies', 'Categorie “accessoires” verkoopt goed, maar met te hoge korting.', C.red);
    addBullet(s, 452, 448, 350, 'Voorraadkans', '42 SKU’s vertegenwoordigen 28% van het vastzittende kapitaal.', C.orange);
    addBullet(s, 852, 448, 350, 'Volgende actie', 'Stop nabestellen van 7 slow movers; herbekijk prijs of bundel.', C.blue);
    notes(s, 'Illustratieve KPI’s en scenario, bedoeld om de toekomstige intelligence-laag tastbaar te maken.');
  }

  // 5 — Data to action
  {
    const s = newSlide(p);
    title(s, 'De waarde zit in de stap van gebeurtenis naar beslissing.', 'Hoe het werkt', 5);
    const xs = [76, 342, 608, 874];
    const heads = ['Verzamelen', 'Begrijpen', 'Verklaren', 'Activeren'];
    const bodies = [
      'Verkoop, retour, voorraad, klant, korting, medewerker, locatie.',
      'Eén universeel retaildatamodel en consistente KPI’s.',
      'Trends, afwijkingen, oorzaken en kansen worden zichtbaar.',
      'Concrete acties met prioriteit, eigenaar en verwachte impact.',
    ];
    for (let i = 0; i < xs.length; i += 1) {
      dot(s, xs[i], 268, 50, i === 3 ? C.blue : C.cyan);
      addText(s, String(i + 1).padStart(2, '0'), xs[i] + 13, 280, 28, 22, { fontSize: 14, bold: true, color: C.white, alignment: 'center' });
      addText(s, heads[i], xs[i] - 20, 360, 190, 30, { fontSize: 22, bold: true });
      addText(s, bodies[i], xs[i] - 20, 402, 205, 92, { fontSize: 16, color: C.muted });
      if (i < xs.length - 1) rule(s, xs[i] + 54, 292, 196, C.line, 2);
    }
    rect(s, 52, 556, 1176, 60, C.bluePale, 'none');
    addText(s, 'Voorbeeld: “Omzet +8%, marge -2,4 pp”  →  “kortingen in categorie X veroorzaken 71% van de daling”  →  “promotie aanpassen”.', 76, 575, 1120, 28, { fontSize: 17, bold: true, color: C.ink });
    notes(s, 'Eigen productarchitectuur en conceptueel proces. Geen externe bron gebruikt.');
  }

  // 6 — General retail model
  {
    const s = newSlide(p);
    title(s, 'Een universele retailkern — uitbreidbaar per winkeltype.', 'Het platform', 6);
    addText(s, 'De kern verandert niet wanneer de winkel verandert.', 52, 154, 700, 32, { fontSize: 24, color: C.muted });
    rect(s, 52, 236, 500, 348, C.pale, 'none');
    addText(s, 'UNIVERSELE KERN', 84, 266, 300, 24, { fontSize: 13, bold: true, color: C.blue, letterSpacing: 1.2 });
    addText(s, 'Producten\nVerkoop\nVoorraad\nKlanten\nBetalingen\nMedewerkers\nInzichten', 84, 314, 340, 220, { fontSize: 25, bold: true });
    rect(s, 650, 236, 578, 96, C.bluePale, 'none');
    addText(s, 'FASHION', 680, 258, 120, 22, { fontSize: 13, bold: true, color: C.blue });
    addText(s, 'maten · collecties · seizoenen', 680, 288, 480, 24, { fontSize: 18, color: C.ink });
    rect(s, 650, 350, 578, 96, C.pale, 'none');
    addText(s, 'ELECTRONICA', 680, 372, 160, 22, { fontSize: 13, bold: true, color: C.blue });
    addText(s, 'serienummers · garantie · accessoires', 680, 402, 480, 24, { fontSize: 18, color: C.ink });
    rect(s, 650, 464, 578, 96, C.pale, 'none');
    addText(s, 'SPECIAALZAAK', 680, 486, 180, 22, { fontSize: 13, bold: true, color: C.blue });
    addText(s, 'advies · configuratie · service · community', 680, 516, 480, 24, { fontSize: 18, color: C.ink });
    notes(s, 'Eigen productstrategie. De voorbeelden zijn illustratief en tonen waarom Pwayment horizontaal kan starten met verticale uitbreidingen.');
  }

  // 7 — Why now / differentiation
  {
    const s = newSlide(p);
    title(s, 'Pwayment hoeft niet de grootste POS te zijn — alleen de slimste laag erbovenop.', 'De positionering', 7);
    rect(s, 52, 182, 360, 360, C.pale, 'none');
    addText(s, 'TRADITIONELE POS', 82, 216, 240, 22, { fontSize: 13, bold: true, color: C.muted, letterSpacing: 1.2 });
    addText(s, 'Registreert\nwat er gebeurd is.', 82, 274, 270, 78, { fontSize: 30, bold: true });
    addText(s, 'Sterk in transacties.\nZwak in interpretatie en actie.', 82, 410, 270, 56, { fontSize: 18, color: C.muted });
    rect(s, 460, 182, 360, 360, C.pale, 'none');
    addText(s, 'PWAYMENT', 490, 216, 240, 22, { fontSize: 13, bold: true, color: C.blue, letterSpacing: 1.2 });
    addText(s, 'Begrijpt\nwat er gebeurt.', 490, 274, 270, 78, { fontSize: 30, bold: true });
    addText(s, 'Verbindt verkoop, marge, stock en klantgedrag tot beslissingen.', 490, 410, 270, 76, { fontSize: 18, color: C.muted });
    rect(s, 868, 182, 360, 360, C.blue, 'none');
    addText(s, 'DE VOLGENDE LAAG', 898, 216, 260, 22, { fontSize: 13, bold: true, color: C.white, letterSpacing: 1.2 });
    addText(s, 'Stuurt\nwat er gebeurt.', 898, 274, 270, 78, { fontSize: 30, bold: true, color: C.white });
    addText(s, 'Aanbevelingen, automatisering en koppeling met de fysieke winkel.', 898, 410, 270, 76, { fontSize: 18, color: '#EAF5FF' });
    addText(s, 'De kassa is het startpunt. De beslissingslaag is het product.', 52, 594, 900, 34, { fontSize: 26, bold: true });
    notes(s, 'De vergelijking is positionering, geen claim dat bestaande POS-systemen geen rapportage hebben.');
  }

  // 8 — Talemate fit
  {
    const s = newSlide(p);
    title(s, 'TALEMATE kan Pwayment verbinden met de fysieke retailwereld.', 'Strategische fit', 8);
    addText(s, 'TALEMATE brengt een platformvisie rond open API’s, no-code, IoT, AI en robotics.\nPwayment brengt de retaildata en de beslissingen die daaruit volgen.', 52, 154, 1030, 66, { fontSize: 23, color: C.muted });
    rule(s, 52, 258, 1176, C.line, 1);
    rect(s, 52, 304, 320, 210, C.pale, 'none');
    addText(s, 'PWAYMENT', 82, 338, 200, 22, { fontSize: 13, bold: true, color: C.blue, letterSpacing: 1.2 });
    addText(s, 'Retail events\nMetrics\nActions', 82, 388, 220, 94, { fontSize: 28, bold: true });
    rect(s, 480, 304, 320, 210, C.bluePale, 'none');
    addText(s, 'OPEN CONNECTOR', 510, 338, 240, 22, { fontSize: 13, bold: true, color: C.blue, letterSpacing: 1.2 });
    addText(s, 'API\nNo-code workflows\nCloud sync', 510, 388, 240, 94, { fontSize: 26, bold: true });
    rect(s, 908, 304, 320, 210, C.blue, 'none');
    addText(s, 'TALEMATE ECOSYSTEM', 938, 338, 250, 22, { fontSize: 13, bold: true, color: C.white, letterSpacing: 1.2 });
    addText(s, 'IoT\nDisplays\nKiosks · robots · AI', 938, 388, 240, 94, { fontSize: 26, bold: true, color: C.white });
    rule(s, 372, 409, 108, C.blue, 3);
    rule(s, 800, 409, 108, C.blue, 3);
    addText(s, 'Niet: nog een losse kassatoepassing.\nWel: een retail use case voor een open automation platform.', 52, 570, 900, 58, { fontSize: 25, bold: true });
    notes(s, '[Sources]\nTALEMATE platform one-pager: https://www.talemate.co/web/content/83385?unique=ff28d6f34da4da333f5fb15bacd61f7b7c1884a06\nTALEMATE contact/product overview: https://www.talemate.co/contact\nDe strategische fit is een interpretatie op basis van deze publieke positionering.');
  }

  // 9 — Roadmap
  {
    const s = newSlide(p);
    title(s, 'De investering bouwt eerst de intelligence-laag — productie volgt daarna.', 'Roadmap', 9);
    const y = 278;
    rule(s, 98, y + 10, 1060, C.line, 3);
    const phases = [
      { x: 116, nr: '01', head: 'Bewijzen', body: 'Dashboard\nMetrics engine\nRetail event model', color: C.blue },
      { x: 438, nr: '02', head: 'Verbinden', body: 'API’s\nIntegraties\nTALEMATE connector', color: C.cyan },
      { x: 760, nr: '03', head: 'Activeren', body: 'Aanbevelingen\nAutomatisering\nAI-assistent', color: C.green },
      { x: 1082, nr: '04', head: 'Schalen', body: 'Multi-store\nPartners\nRetail ecosystem', color: C.orange },
    ];
    for (const phase of phases) {
      dot(s, phase.x, y - 18, 56, phase.color);
      addText(s, phase.nr, phase.x + 14, y - 3, 28, 20, { fontSize: 14, bold: true, color: C.white, alignment: 'center' });
      addText(s, phase.head, phase.x - 30, 356, 140, 30, { fontSize: 22, bold: true, alignment: 'center' });
      addText(s, phase.body, phase.x - 42, 406, 164, 84, { fontSize: 17, color: C.muted, alignment: 'center' });
    }
    rect(s, 52, 550, 1176, 74, C.pale, 'none');
    addText(s, 'Donderdag tonen we een richting die technisch én commercieel kan schalen.', 78, 576, 1120, 28, { fontSize: 18, bold: true });
    notes(s, 'Roadmap is voorstel voor de meeting. Productiehardening staat bewust later; eerst moet de strategische productwaarde overtuigen.');
  }

  // 10 — Ask
  {
    const s = newSlide(p);
    addText(s, 'PWAYMENT', 52, 42, 300, 28, { fontSize: 15, bold: true, color: C.blue, letterSpacing: 2 });
    addText(s, 'De vraag is niet of retail\ndigitaler wordt.', 52, 184, 900, 120, { fontSize: 54, bold: true });
    addText(s, 'De vraag is wie de data van de winkel\nomzet in betere beslissingen kan laten worden.', 56, 360, 800, 82, { fontSize: 26, color: C.muted });
    rect(s, 870, 194, 300, 220, C.blue, 'none');
    addText(s, 'SAMEN', 904, 230, 220, 24, { fontSize: 14, bold: true, color: C.white, letterSpacing: 1.4 });
    addText(s, 'Pwayment\n×\nTALEMATE', 904, 278, 220, 102, { fontSize: 30, bold: true, color: C.white });
    addText(s, 'Een intelligent retailplatform\nvoor de winkel van morgen.', 56, 570, 800, 56, { fontSize: 28, bold: true });
    addText(s, 'Discussie: welke retail-use-case bouwen we samen als eerste?', 56, 646, 900, 26, { fontSize: 16, color: C.muted });
    notes(s, 'Afsluiter: de gewenste volgende stap is een gezamenlijke discovery rond de eerste retail-use-case en technische connector.');
  }

  await fs.mkdir(PREVIEW, { recursive: true });
  for (const [i, slide] of p.slides.items.entries()) {
    const png = await p.export({ slide, format: 'png', scale: 1 });
    await fs.writeFile(`${PREVIEW}/slide-${String(i + 1).padStart(2, '0')}.png`, new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: 'layout' });
    await fs.writeFile(`${PREVIEW}/slide-${String(i + 1).padStart(2, '0')}.layout.json`, await layout.text());
  }
  const montage = await p.export({ format: 'webp', montage: true, scale: 1 });
  await fs.writeFile(`${PREVIEW}/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
  const pptx = await PresentationFile.exportPptx(p);
  await pptx.save(OUT);
  console.log(OUT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
