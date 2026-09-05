import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const htmlPath = path.join(projectRoot, 'pitchdeck_print.html');
const outputPath = path.join(projectRoot, 'PWAYMENT_Pitchdeck_2026.pdf');
const artifactPdfPath = '/Users/kevin/.gemini/antigravity-ide/brain/6b830be7-9d84-4a22-9be7-6266a62b197b/PWAYMENT_Pitchdeck_2026.pdf';

async function generatePitchdeckPDF() {
  console.log('Launching browser to render pitchdeck PDF...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  
  // Serve via file url or navigate
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // ensure fonts and images are fully decoded

  console.log('Generating PDF...');
  await page.pdf({
    path: outputPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    preferCSSPageSize: true,
  });

  await page.pdf({
    path: artifactPdfPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    preferCSSPageSize: true,
  });

  console.log(`PDF successfully generated at: ${outputPath}`);
  console.log(`Artifact copy at: ${artifactPdfPath}`);

  await browser.close();
}

generatePitchdeckPDF().catch((err) => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
