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
