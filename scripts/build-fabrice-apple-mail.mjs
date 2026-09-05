import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'mail-fabrice-inline.html');
const outputPath = path.join(root, 'mail-fabrice-apple-mail.eml');
const relatedBoundary = '----pwayment-related-20260824';
const alternativeBoundary = '----pwayment-alternative-20260824';

const wrapBase64 = (value) => Buffer.from(value).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
const encodeHeader = (value) => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
const mediaTypeFor = (filename) => filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
const decodeEntities = (value) => value
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'");

let html = await readFile(sourcePath, 'utf8');
const images = [];
let imageIndex = 0;

html = html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (match, prefix, source, suffix) => {
  if (/^(?:https?:|cid:|data:)/i.test(source)) return match;
  const absolutePath = path.resolve(root, source);
  const contentId = `pwayment-image-${String(++imageIndex).padStart(2, '0')}@pwayment.be`;
  images.push({ absolutePath, contentId, filename: path.basename(source) });
  return `${prefix}cid:${contentId}${suffix}`;
});

const plainText = decodeEntities(html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<figcaption[^>]*>/gi, '\n')
  .replace(/<\/(?:p|h1|h2|figure|div|article)>/gi, '\n\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim());

const lines = [
  `From: ${encodeHeader('Kevin')} <hello@pwayment.be>`,
  'To:',
  `Subject: ${encodeHeader('PWAYMENT Retail — van nieuw account tot volledige retailoperatie')}`,
  `Date: ${new Date().toUTCString()}`,
  'MIME-Version: 1.0',
  'X-Unsent: 1',
  `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
  '',
  `--${relatedBoundary}`,
  `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
  '',
  `--${alternativeBoundary}`,
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: base64',
  '',
  wrapBase64(plainText),
  `--${alternativeBoundary}`,
  'Content-Type: text/html; charset="UTF-8"',
  'Content-Transfer-Encoding: base64',
  '',
  wrapBase64(html),
  `--${alternativeBoundary}--`,
];

for (const image of images) {
  const content = await readFile(image.absolutePath);
  lines.push(
    `--${relatedBoundary}`,
    `Content-Type: ${mediaTypeFor(image.filename)}; name="${image.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-ID: <${image.contentId}>`,
    `Content-Disposition: inline; filename="${image.filename}"`,
    '',
    content.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '',
  );
}

lines.push(`--${relatedBoundary}--`, '');
await writeFile(outputPath, lines.join('\r\n'));
console.log(`Created ${path.basename(outputPath)} with ${images.length} embedded images.`);
