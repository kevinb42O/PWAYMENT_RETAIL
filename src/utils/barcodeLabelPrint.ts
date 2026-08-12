import { printDomInIsolatedFrame } from './printDom';

export type BarcodeLabelPreset = 'sheet' | 'roll';

const sharedCss = `
  * { box-sizing: border-box !important; }
  html, body {
    background: white !important;
    color: black !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  [data-barcode-labels-root] {
    margin: 0 !important;
    padding: 0 !important;
  }
  .label-print {
    background: white !important;
    color: black !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
`;

export const getBarcodeLabelPrintCss = (
  preset: BarcodeLabelPreset,
): string => {
  if (preset === 'roll') {
    return `${sharedCss}
      @page { size: 58mm 32mm; margin: 0; }
      html, body, [data-barcode-labels-root] {
        width: 58mm !important;
      }
      [data-barcode-labels-root] {
        display: block !important;
      }
      .label-print {
        display: flex !important;
        width: 58mm !important;
        height: 32mm !important;
        margin: 0 !important;
        break-after: page !important;
        page-break-after: always !important;
      }
      .label-print:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }
    `;
  }

  return `${sharedCss}
    @page { size: A4 portrait; margin: 0; }
    html, body, [data-barcode-labels-root] {
      width: 210mm !important;
    }
    body {
      min-height: 297mm !important;
    }
    [data-barcode-labels-root] {
      display: grid !important;
      grid-template-columns: repeat(3, 70mm) !important;
      grid-auto-rows: 36mm !important;
      gap: 0 !important;
      align-content: start !important;
      justify-content: start !important;
    }
    .label-print {
      width: 70mm !important;
      height: 36mm !important;
      margin: 0 !important;
    }
  `;
};

export const printBarcodeLabels = (preset: BarcodeLabelPreset): boolean =>
  printDomInIsolatedFrame('[data-barcode-labels-root]', {
    title: preset === 'sheet' ? 'Barcode-etiketten A4' : 'Barcode-etiketten labelprinter',
    pageCss: getBarcodeLabelPrintCss(preset),
  });
