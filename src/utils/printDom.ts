/**
 * Print the on-screen receipt by cloning the live DOM into a brand-new
 * window. We copy all <style> and <link rel="stylesheet"> tags from the
 * current document so Tailwind utility classes apply identically.
 *
 * This avoids the usual @media print pitfalls (clipped overflow ancestors,
 * absolute positioning, scroll offsets) and gives us a clean, predictable
 * print job that we can later swap for an ESC/POS thermal printer driver.
 */
export function printReceiptDom(rootSelector = '[data-receipt-root]'): void {
  const node = document.querySelector(rootSelector) as HTMLElement | null;
  if (!node) {
    console.warn('printReceiptDom: receipt node not found');
    return;
  }

  const w = window.open('', 'pwayment-receipt', 'width=420,height=720');
  if (!w) {
    alert('Pop-ups zijn geblokkeerd. Sta pop-ups toe om te kunnen printen.');
    return;
  }

  // Collect all stylesheet links + inline <style> tags from the parent doc.
  const head = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((el) => el.outerHTML)
    .join('\n');

  w.document.open();
  w.document.write(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>Kassaticket</title>
${head}
<style>
  @page { size: 80mm auto; margin: 4mm; }
  html, body { background: white; color: black; margin: 0; padding: 0; }
  body { display: flex; justify-content: center; padding: 8px 0; }
</style>
</head>
<body>
${node.outerHTML}
</body>
</html>`);
  w.document.close();

  // Give the new doc a tick to apply styles, then print.
  const trigger = () => {
    w.focus();
    w.print();
    // Some browsers (Safari) close immediately, others need an explicit close
    // after the print dialog is dismissed. We close on afterprint when available.
    w.addEventListener('afterprint', () => w.close());
  };

  if (w.document.readyState === 'complete') {
    setTimeout(trigger, 50);
  } else {
    w.addEventListener('load', () => setTimeout(trigger, 50));
  }
}

export interface IsolatedPrintOptions {
  title: string;
  pageCss: string;
}

export const buildIsolatedPrintDocument = (
  markup: string,
  { title, pageCss }: IsolatedPrintOptions,
  inheritedHead = '',
): string => `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
${inheritedHead}
<style>
${pageCss}
</style>
</head>
<body>
${markup}
</body>
</html>`;

/**
 * Print one part of the application from an isolated iframe. Printing the live
 * window makes the result depend on every layout ancestor (navigation,
 * overflow containers and responsive widths), which is especially damaging
 * for millimetre-sized labels.
 */
export function printDomInIsolatedFrame(
  rootSelector: string,
  { title, pageCss }: IsolatedPrintOptions,
): boolean {
  const node = document.querySelector(rootSelector) as HTMLElement | null;
  if (!node) {
    console.warn(`printDomInIsolatedFrame: node not found (${rootSelector})`);
    return false;
  }

  const frame = document.createElement('iframe');
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument;
  if (!printWindow || !printDocument) {
    frame.remove();
    return false;
  }

  const inheritedHead = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((element) => element.outerHTML)
    .join('\n');

  printDocument.open();
  printDocument.write(
    buildIsolatedPrintDocument(node.outerHTML, { title, pageCss }, inheritedHead),
  );
  printDocument.close();

  let started = false;
  const startPrint = async () => {
    if (started) return;
    started = true;

    const stylesheets = Array.from(
      printDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    );
    await Promise.all(
      stylesheets.map(
        (stylesheet) =>
          new Promise<void>((resolve) => {
            let settled = false;
            const settle = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            if (stylesheet.sheet) {
              settle();
              return;
            }
            stylesheet.addEventListener('load', settle, { once: true });
            stylesheet.addEventListener('error', settle, { once: true });
            window.setTimeout(settle, 2_000);
          }),
      ),
    );

    if (printDocument.fonts) {
      await printDocument.fonts.ready;
    }

    printWindow.requestAnimationFrame(() => {
      printWindow.requestAnimationFrame(() => {
        printWindow.addEventListener('afterprint', () => frame.remove(), {
          once: true,
        });
        printWindow.focus();
        printWindow.print();
      });
    });
  };

  frame.addEventListener('load', () => void startPrint(), { once: true });
  window.setTimeout(() => void startPrint(), 0);
  return true;
}
