import { describe, expect, it } from 'vitest';
import { getBarcodeLabelPrintCss } from './barcodeLabelPrint';
import { buildIsolatedPrintDocument } from './printDom';

describe('barcode label print layouts', () => {
  it('lays an A4 sticker sheet out as three exact 70 by 36 mm columns', () => {
    const css = getBarcodeLabelPrintCss('sheet');

    expect(css).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(css).toContain('grid-template-columns: repeat(3, 70mm)');
    expect(css).toContain('grid-auto-rows: 36mm');
    expect(css).toContain('width: 210mm');
  });

  it('prints every roll label on its own 58 by 32 mm page', () => {
    const css = getBarcodeLabelPrintCss('roll');

    expect(css).toContain('@page { size: 58mm 32mm; margin: 0; }');
    expect(css).toContain('width: 58mm');
    expect(css).toContain('height: 32mm');
    expect(css).toContain('break-after: page');
  });

  it('builds a print document containing labels without the application shell', () => {
    const html = buildIsolatedPrintDocument(
      '<div data-barcode-labels-root><div class="label-print">Label</div></div>',
      { title: 'Barcode-etiketten A4', pageCss: getBarcodeLabelPrintCss('sheet') },
      '<style>.label-print { display: flex; }</style>',
    );

    expect(html).toContain('data-barcode-labels-root');
    expect(html).toContain('Barcode-etiketten A4');
    expect(html).toContain('grid-template-columns: repeat(3, 70mm)');
    expect(html).not.toContain('Instellingen & Licentie');
    expect(html).not.toContain('<nav');
  });
});
