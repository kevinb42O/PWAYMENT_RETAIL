import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.PWAYMENT_TRANSLATION_BASE_URL ?? 'http://127.0.0.1:4173';
const routes = JSON.parse(await readFile(path.join(root, 'src/public/public-site-registry.json'), 'utf8'));

const dynamicMessages = [
  'Taal kiezen', 'Nederlands', 'Français', 'English', 'Mobiele navigatie', 'Navigatie sluiten', 'Navigatie openen',
  'De beveiligde aanvraagopslag is nog niet gekoppeld. Mail voorlopig naar hello@pwayment.be.',
  'Je aanvraag kon niet worden opgeslagen. Probeer opnieuw of mail naar hello@pwayment.be.',
  'Veilig verzenden…', 'met jaarlijkse softwareprijs', 'maandelijks opzegbare softwareprijs',
  'Video afspelen', 'Video pauzeren', 'Meer dan 10', 'Meerdere systemen',
];

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const collectPageMessages = async (page) => page.locator('body').evaluate(() => {
  const values = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script, style, [data-public-locale]')) continue;
    const value = node.textContent?.replace(/\s+/g, ' ').trim();
    if (value) values.push(value);
  }
  for (const element of document.body.querySelectorAll('[aria-label], [placeholder], [alt], [title]')) {
    for (const attribute of ['aria-label', 'placeholder', 'alt', 'title']) {
      const value = element.getAttribute(attribute)?.trim();
      if (value) values.push(value);
    }
  }
  return values;
});

const sourceMessages = new Set(dynamicMessages);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });

for (const route of routes) {
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
  (await collectPageMessages(page)).forEach((message) => sourceMessages.add(normalize(message)));

  // Reveal non-destructive interactive copy such as menus, pricing cycles,
  // carousels and Pace scenarios. Links and submit buttons are excluded.
  const buttons = page.locator('button:not([type="submit"])');
  const buttonCount = await buttons.count();
  for (let index = 0; index < buttonCount; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(30);
    (await collectPageMessages(page)).forEach((message) => sourceMessages.add(normalize(message)));
  }
}

await browser.close();

for (const route of routes) {
  sourceMessages.add(normalize(route.title));
  sourceMessages.add(normalize(route.description));
}

const identityPattern = /^(?:[\d\s.,+–—·/%€]|PWAYMENT|Pace|POS|PIN|API|REST|GraphQL|SFTP|CSV|JSON|SKU|EAN-13|Dymo|Zebra|Chromium|HTTPS|WebUSB|ESC\/POS|MFA|SLA|Supabase|Shopify|WooCommerce|Peppol|Exact|Octopus|Worldline|CCV|SumUp|Viva|Verifone|ServiceDesk|Enterprise|Professional|Live|Beta|Pilot|[A-Z]{1,4})+$/;

const glossaries = {
  fr: [
    ['PWAYMENT', 'PWAYMENT'], ['ServiceDesk', 'ServiceDesk'], ['Retail Professional', 'Retail Professional'], ['Pace', 'Pace'],
    ['kassasysteem', 'système de caisse'], ['kassasoftware', 'logiciel de caisse'], ['kassaflow', 'parcours de caisse'], ['kassaschermen', 'écrans de caisse'], ['kassascherm', 'écran de caisse'], ['kassalade', 'tiroir-caisse'], ['kassamedewerker', 'employé de caisse'], ['kassier', 'caissier'],
    ['voorraadprognose', 'prévision des stocks'], ['voorraaddekking', 'couverture de stock'], ['voorraadbeheer', 'gestion des stocks'], ['voorraadbeweging', 'mouvement de stock'], ['voorraadwaarde', 'valeur du stock'], ['voorraad', 'stock'],
    ['winkeloperatie', 'gestion du magasin'], ['winkelvloer', 'surface de vente'], ['winkelbeeld', 'vue d\u2019ensemble du magasin'], ['winkelhardware', 'matériel de magasin'], ['winkel', 'magasin'],
    ['cadeaubonnen', 'cartes-cadeaux'], ['cadeaubon', 'carte-cadeau'], ['dagafsluiting', 'clôture journalière'], ['Z-rapport', 'rapport Z'],
    ['betaalterminals', 'terminaux de paiement'], ['betaalterminal', 'terminal de paiement'], ['betaalmethodes', 'modes de paiement'], ['betaalmethode', 'mode de paiement'], ['betaalwijze', 'mode de paiement'], ['betaalmix', 'répartition des paiements'],
    ['klantendisplay', 'écran client'], ['klantbeeld', 'vue client'], ['klanten', 'clients'], ['klant', 'client'], ['barcodescanner', 'lecteur de codes-barres'],
    ['besteladvies', 'recommandation de commande'], ['inkooporders', 'bons de commande'], ['inkooporder', 'bon de commande'], ['boekhouding', 'comptabilité'], ['herstellingen', 'réparations'], ['herstelling', 'réparation'], ['btw', 'TVA'], ['webshop', 'boutique en ligne'],
  ],
  en: [
    ['PWAYMENT', 'PWAYMENT'], ['ServiceDesk', 'ServiceDesk'], ['Retail Professional', 'Retail Professional'], ['Pace', 'Pace'],
    ['kassasysteem', 'POS system'], ['kassasoftware', 'POS software'], ['kassaflow', 'checkout flow'], ['kassaschermen', 'checkout screens'], ['kassascherm', 'checkout screen'], ['kassalade', 'cash drawer'], ['kassamedewerker', 'cashier'], ['kassier', 'cashier'],
    ['voorraadprognose', 'inventory forecast'], ['voorraaddekking', 'stock coverage'], ['voorraadbeheer', 'inventory management'], ['voorraadbeweging', 'stock movement'], ['voorraadwaarde', 'inventory value'], ['voorraad', 'inventory'],
    ['winkeloperatie', 'store operation'], ['winkelvloer', 'shop floor'], ['winkelbeeld', 'view of your store'], ['winkelhardware', 'store hardware'], ['winkel', 'store'],
    ['cadeaubonnen', 'gift cards'], ['cadeaubon', 'gift card'], ['dagafsluiting', 'daily close'], ['Z-rapport', 'Z report'],
    ['betaalterminals', 'payment terminals'], ['betaalterminal', 'payment terminal'], ['betaalmethodes', 'payment methods'], ['betaalmethode', 'payment method'], ['betaalwijze', 'payment method'], ['betaalmix', 'payment mix'],
    ['klantendisplay', 'customer display'], ['klantbeeld', 'customer view'], ['klanten', 'customers'], ['klant', 'customer'], ['barcodescanner', 'barcode scanner'],
    ['besteladvies', 'reorder recommendation'], ['inkooporders', 'purchase orders'], ['inkooporder', 'purchase order'], ['boekhouding', 'accounting'], ['herstellingen', 'repairs'], ['herstelling', 'repair'], ['btw', 'VAT'], ['webshop', 'online store'],
  ],
};

const protectGlossary = (source, targetLocale) => {
  let protectedText = source;
  const replacements = [];
  const terms = [...glossaries[targetLocale]].sort((a, b) => b[0].length - a[0].length);
  terms.forEach(([term, target], index) => {
    const token = `__PWTERM${index}__`;
    if (!protectedText.includes(term)) return;
    protectedText = protectedText.replaceAll(term, token);
    replacements.push([token, target]);
  });
  return { protectedText, replacements };
};

const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const decodeHtml = (value) => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&#39;', "'").replaceAll('&quot;', '"');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const translateBatch = async (batch, targetLocale, attempt = 0) => {
  const prepared = batch.map((source) => ({ source, ...protectGlossary(source, targetLocale) }));
  try {
    return await Promise.all(prepared.map(async (item) => {
      const body = new URLSearchParams({ client: 'gtx', sl: 'nl', tl: targetLocale, dt: 't', q: item.protectedText });
      const response = await fetch('https://translate.googleapis.com/translate_a/single', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      let translated = payload[0].map((part) => part[0]).join('');
      for (const [token, target] of item.replacements) translated = translated.replaceAll(token, target);
      return translated.replace(/\s+/g, ' ').trim();
    }));
  } catch (error) {
    if (attempt >= 4) throw error;
    await wait(750 * 2 ** attempt);
    return translateBatch(batch, targetLocale, attempt + 1);
  }
};

const messages = [...sourceMessages].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nl'));
await mkdir(path.join(root, 'src/public/locales'), { recursive: true });

for (const locale of ['fr', 'en']) {
  const dictionary = {};
  const translatable = messages.filter((message) => !identityPattern.test(message) && !message.includes('@pwayment.be'));
  messages.filter((message) => !translatable.includes(message)).forEach((message) => { dictionary[message] = message; });

  let batch = [];
  let batchLength = 0;
  const flush = async () => {
    if (!batch.length) return;
    const translated = await translateBatch(batch, locale);
    batch.forEach((source, index) => { dictionary[source] = translated[index]; });
    batch = [];
    batchLength = 0;
  };

  for (const message of translatable) {
    if (batch.length >= 18 || batchLength + message.length > 3600) await flush();
    batch.push(message);
    batchLength += message.length;
  }
  await flush();

  const ordered = Object.fromEntries(messages.map((message) => [message, dictionary[message] ?? message]));
  await writeFile(path.join(root, `src/public/locales/${locale}.json`), `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  console.log(`Generated ${locale}.json with ${messages.length} public messages.`);
}
