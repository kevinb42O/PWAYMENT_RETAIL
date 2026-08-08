/**
 * ThermalPrinterPanel.tsx
 *
 * React component that wires together:
 *   • `useThermalPrinter` — WebUSB connection lifecycle
 *   • `EscPosBuilder`     — ESC/POS raw byte construction
 *   • `EscPosPrintAdapter`— Drop-in replacement for the existing PrintAdapter
 *
 * It also exports `EscPosPrintAdapter` so you can call `setPrintAdapter()`
 * in your app bootstrap to route all `printReceipt()` calls through WebUSB:
 *
 * ```ts
 * // In your app init or after connecting:
 * import { setPrintAdapter } from '../utils/print';
 * import { EscPosPrintAdapter } from './ThermalPrinterPanel';
 *
 * setPrintAdapter(new EscPosPrintAdapter(sendRawFn));
 * ```
 */

import React, { useCallback } from 'react';
import { format } from 'date-fns';
import type { Transaction } from '../types';
import { formatEUR } from '../utils/money';
import { calculateTotals } from '../utils/vat';
import { getMerchantProfileSnapshot } from '../store/useMerchantProfile';
import { EscPosBuilder, formatItemLine, formatTotalLine } from '../utils/escpos';
import {
  useThermalPrinter,
  EPSON_PRODUCT_IDS,
  type PrinterStatus,
} from '../hooks/useThermalPrinter';
import type { PrintAdapter } from '../utils/print';

// ---------------------------------------------------------------------------
// ESC/POS Print Adapter (implements existing PrintAdapter interface)
// ---------------------------------------------------------------------------

/**
 * `EscPosPrintAdapter` — Bridges the app's existing `PrintAdapter` interface
 * with a WebUSB `sendRaw()` function.
 *
 * Once instantiated, pass it to `setPrintAdapter()` so that all existing
 * `printReceipt(transaction)` calls are transparently routed to the printer.
 *
 * Layout targets an 80mm roll with 42 characters per line.
 */
export class EscPosPrintAdapter implements PrintAdapter {
  constructor(
    private readonly sendRaw: (data: Uint8Array) => Promise<void>,
  ) {}

  async printReceipt(t: Transaction): Promise<void> {
    const merchant = getMerchantProfileSnapshot();
    const totals   = calculateTotals(t.items, t.discountCents);

    // ── Helper: format price consistently ───────────────────────────────
    // `formatEUR` returns "€ 3,50" (Belgian nl-BE locale).
    // We strip the non-breaking space that Intl inserts between "€" and the
    // number so it fits predictably in our fixed-width columns.
    const fmt = (cents: number) =>
      formatEUR(cents).replace('\u00a0', ' ');

    // ── Ticket number (if available) ─────────────────────────────────────
    const ticketStr = t.id != null ? `#${String(t.id).padStart(5, '0')}` : '';

    // ── Build ESC/POS byte stream ────────────────────────────────────────
    const b = new EscPosBuilder();

    b.init()
     // Code page 19 = PC858 — has Euro sign (€) at byte 0xD5
     .codePage(19);

    // ── Header: shop name (centered, double-size, bold) ──────────────────
    b.alignCenter()
     .bold(true)
     .doubleSize()
     .text(`${merchant.name}\n`)
     .normalSize()
     .bold(false);

    // Legal name (if different from trading name)
    if (merchant.legalName && merchant.legalName !== merchant.name) {
      b.text(`${merchant.legalName}\n`);
    }

    b.text(`${merchant.addressLine1}\n`)
     .text(`${merchant.addressLine2}\n`)
     .text(`BTW: ${merchant.vatNumber}\n`);

    if (merchant.phone)   b.text(`Tel: ${merchant.phone}\n`);
    if (merchant.website) b.text(`${merchant.website}\n`);

    b.separator('-', 42);

    // ── Transaction meta ──────────────────────────────────────────────────
    b.alignLeft();

    const dateStr = format(t.timestamp, 'dd/MM/yyyy HH:mm');
    b.text(formatTotalLine('Datum', dateStr));

    if (ticketStr) b.text(formatTotalLine('Ticket', ticketStr));

    b.text(formatTotalLine('Kassa', String(t.tableId)));
    if (t.userName) b.text(formatTotalLine('Kassier', t.userName));

    b.separator('-', 42);

    // ── Line items ────────────────────────────────────────────────────────
    for (const item of t.items) {
      const modSum =
        (item.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
      const unit      = item.product.priceCents + modSum;
      const lineTotal = unit * item.quantity;

      b.text(formatItemLine(item.quantity, item.product.name, fmt(lineTotal)));

      // Unit price + VAT rate on second line, indented
      const vatRate = item.product.vatRate ?? 21;
      b.text(`    a ${fmt(unit)}  (${vatRate}%)\n`);

      // Modifiers
      for (const mod of item.modifiers ?? []) {
        const delta = mod.deltaCents > 0 ? `  +${fmt(mod.deltaCents * item.quantity)}` : '';
        b.text(`    + ${mod.label}${delta}\n`);
      }

      // Item notes
      if (item.notes) {
        b.text(`    ! ${item.notes}\n`);
      }
    }

    b.separator('-', 42);

    // ── Subtotal & discount ───────────────────────────────────────────────
    b.text(formatTotalLine('Subtotaal', fmt(t.subtotalCents)));

    if (t.discountCents > 0) {
      const discLabel = t.discountReason
        ? `Korting (${t.discountReason})`
        : 'Korting';
      b.text(formatTotalLine(discLabel, `-${fmt(t.discountCents)}`));
    }

    b.separator('-', 42);

    // ── TOTAAL (bold + double-height) ─────────────────────────────────────
    b.bold(true).doubleHeight();
    b.text(formatTotalLine('TOTAAL', fmt(t.totalCents)));
    b.bold(false).normalSize();

    b.separator('-', 42);

    // ── BTW uitsplitsing (required by Belgian fiscal law) ────────────────
    b.text('BTW UITSPLITSING\n');
    // Header row
    b.text(
      `${'Tarief'.padEnd(8)}` +
      `${'Excl.'.padStart(10)}` +
      `${'BTW'.padStart(9)}` +
      `${'Incl.'.padStart(10)}\n`,
    );

    if (totals.discounted12 > 0) {
      b.text(
        `${'12%'.padEnd(8)}` +
        `${fmt(totals.exclVat12).padStart(10)}` +
        `${fmt(totals.vat12).padStart(9)}` +
        `${fmt(totals.discounted12).padStart(10)}\n`,
      );
    }

    b.text(
      `${'21%'.padEnd(8)}` +
      `${fmt(totals.exclVat21).padStart(10)}` +
      `${fmt(totals.vat21).padStart(9)}` +
      `${fmt(totals.discounted21).padStart(10)}\n`,
    );

    b.separator('-', 42);

    // ── Betaling ──────────────────────────────────────────────────────────
    if (t.paymentMethod === 'Split' && t.splitTenders?.length) {
      b.text('Betalingen:\n');
      for (const tender of t.splitTenders) {
        b.text(formatTotalLine(`  ${tender.method}`, fmt(tender.amountCents)));
      }
      const cashTender = t.splitTenders.find((x) => x.method === 'Cash');
      if (cashTender && t.tenderedCents != null) {
        b.text(formatTotalLine('Ontvangen (Cash)', fmt(t.tenderedCents)));
        const change = Math.max(0, t.tenderedCents - cashTender.amountCents);
        b.text(formatTotalLine('Wisselgeld', fmt(change)));
      }
    } else {
      b.text(formatTotalLine('Betaling', t.paymentMethod));
      if (t.paymentMethod === 'Cash' && t.tenderedCents != null) {
        const change = Math.max(0, t.tenderedCents - t.totalCents);
        b.text(formatTotalLine('Ontvangen', fmt(t.tenderedCents)));
        b.text(formatTotalLine('Wisselgeld', fmt(change)));
      }
    }

    b.separator('-', 42);

    // ── Footer ────────────────────────────────────────────────────────────
    b.alignCenter();

    if (merchant.footer)       b.text(`${merchant.footer}\n`);
    if (merchant.returnPolicy) b.text(`${merchant.returnPolicy}\n`);
    if (merchant.email)        b.text(`${merchant.email}\n`);

    b.text('Dit ticket dient als geldig betalingsbewijs.\n');
    b.text('BTW inbegrepen - bewaar uw ticket.\n');

    // Unique receipt fingerprint line (date-kassa-id)
    const fingerprint = `${format(t.timestamp, 'yyyyMMdd-HHmmss')}-R${t.tableId}-${t.id ?? '--'}`;
    b.text(`${fingerprint}\n`);

    // ── Feed and cut ──────────────────────────────────────────────────────
    b.feedLines(4);
    // Partial cut (default) — leaves bridge, receipt stays attached until torn
    b.cut(false);

    // ── Send to printer ───────────────────────────────────────────────────
    await this.sendRaw(b.build());
  }
}

// ---------------------------------------------------------------------------
// Status badge sub-component
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<PrinterStatus, { label: string; color: string; dot: string }> = {
  disconnected: { label: 'Niet verbonden', color: '#6b7280', dot: '#9ca3af' },
  connecting:   { label: 'Verbinden…',     color: '#d97706', dot: '#f59e0b' },
  connected:    { label: 'Verbonden',       color: '#059669', dot: '#10b981' },
  printing:     { label: 'Bezig…',          color: '#2563eb', dot: '#3b82f6' },
  error:        { label: 'Fout',            color: '#dc2626', dot: '#ef4444' },
};

const StatusBadge: React.FC<{ status: PrinterStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  const isPulsing = status === 'connecting' || status === 'printing';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        fontWeight: 500,
        color: cfg.color,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: cfg.dot,
          display: 'inline-block',
          animation: isPulsing ? 'pulse 1.2s ease-in-out infinite' : 'none',
        }}
      />
      {cfg.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main ThermalPrinterPanel component
// ---------------------------------------------------------------------------

interface Props {
  /** Optional pre-built transaction to print. If omitted, a test receipt is printed. */
  transaction?: Transaction;
  /** Called after a successful print, with the bytes sent. */
  onPrintSuccess?: (bytesWritten: number) => void;
  /** Called when a print error occurs. */
  onPrintError?: (error: string) => void;
}

/**
 * `ThermalPrinterPanel` — self-contained UI for printer management.
 *
 * Drop this anywhere in your settings / POS layout.
 * It provides Connect / Disconnect buttons and a "Print Test Receipt" button.
 *
 * To print a real transaction receipt, pass a `transaction` prop.
 */
export const ThermalPrinterPanel: React.FC<Props> = ({
  transaction,
  onPrintSuccess,
  onPrintError,
}) => {
  const { status, isConnected, error, connect, disconnect, sendRaw } =
    useThermalPrinter();

  // ── Connect handler ─────────────────────────────────────────────────────

  const handleConnect = useCallback(() => {
    // Pass the TM-T20II PID — Chrome's device picker will be pre-filtered.
    // Remove the productId argument to show ALL Epson devices (handy for setup).
    void connect(EPSON_PRODUCT_IDS.TM_T20II_B); // PID 0x0E15 — confirmed via ioreg on this unit
  }, [connect]);

  // ── Print handler ───────────────────────────────────────────────────────

  const handlePrint = useCallback(async () => {
    try {
      let bytes: Uint8Array;

      if (transaction) {
        // Print a real receipt using the full adapter
        const adapter = new EscPosPrintAdapter(sendRaw);
        await adapter.printReceipt(transaction);
        bytes = new Uint8Array(0); // Adapter already called sendRaw internally
      } else {
        // Build a standalone test receipt
        bytes = buildTestReceipt();
        await sendRaw(bytes);
      }

      onPrintSuccess?.(bytes.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onPrintError?.(msg);
    }
  }, [transaction, sendRaw, onPrintSuccess, onPrintError]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        fontSize: '14px',
        padding: '20px',
        background: '#1a1a2e',
        border: '1px solid #2d2d4a',
        borderRadius: '12px',
        maxWidth: '420px',
        color: '#e2e8f0',
      }}
    >
      {/* Pulse animation keyframes (injected once via <style>) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <div
            style={{ fontWeight: 700, fontSize: '16px', marginBottom: '2px' }}
          >
            🖨️ Thermische Printer
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>
            Epson TM-T20II — WebUSB
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#7f1d1d',
            border: '1px solid #b91c1c',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '14px',
            fontSize: '12px',
            color: '#fca5a5',
            lineHeight: '1.5',
          }}
        >
          <strong>⚠️ Fout:</strong> {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {!isConnected ? (
          <button
            id="thermal-printer-connect-btn"
            onClick={handleConnect}
            disabled={status === 'connecting'}
            style={buttonStyle('#2563eb', status === 'connecting')}
          >
            {status === 'connecting' ? 'Verbinden…' : '🔌 Printer verbinden'}
          </button>
        ) : (
          <button
            id="thermal-printer-disconnect-btn"
            onClick={() => void disconnect()}
            style={buttonStyle('#475569', false)}
          >
            🔗 Verbreken
          </button>
        )}

        <button
          id="thermal-printer-print-btn"
          onClick={() => void handlePrint()}
          disabled={!isConnected || status === 'printing'}
          style={buttonStyle('#059669', !isConnected || status === 'printing')}
        >
          {status === 'printing' ? 'Bezig…' : '🖨️ Test afdrukken'}
        </button>
      </div>

      {/* Info footer */}
      {!isConnected && status !== 'connecting' && (
        <p
          style={{
            marginTop: '14px',
            fontSize: '11px',
            color: '#64748b',
            lineHeight: '1.6',
          }}
        >
          Klik op <em>Printer verbinden</em> om de Chrome USB
          apparaat-keuzedialog te openen. Selecteer de{' '}
          <strong>EPSON TM-T20</strong> uit de lijst.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline style helper
// ---------------------------------------------------------------------------

function buttonStyle(
  bgColor: string,
  disabled: boolean,
): React.CSSProperties {
  return {
    padding: '9px 18px',
    borderRadius: '8px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    background: disabled ? '#374151' : bgColor,
    color: disabled ? '#6b7280' : '#ffffff',
    transition: 'background 0.15s ease, opacity 0.15s ease',
    opacity: disabled ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };
}

// ---------------------------------------------------------------------------
// Test receipt builder (used when no real transaction is provided)
// ---------------------------------------------------------------------------

function buildTestReceipt(): Uint8Array {
  const now = format(new Date(), 'dd/MM/yyyy HH:mm');

  return new EscPosBuilder()
    .init()
    .codePage(19) // PC858 — has € at 0xD5

    // ── Header ──────────────────────────────────────────────────────────
    .alignCenter()
    .bold(true).doubleSize()
    .text('PWAYMENT SHOP\n')
    .normalSize().bold(false)
    .text('Voorbeeldstraat 1\n')
    .text('9000 Gent\n')
    .text('BTW: BE0123.456.789\n')
    .separator('-', 42)

    // ── Meta ─────────────────────────────────────────────────────────────
    .alignLeft()
    .text(formatTotalLine('TEST TICKET', now))
    .text(formatTotalLine('Kassa', '1'))
    .text(formatTotalLine('Kassier', 'Demo Gebruiker'))
    .separator('-', 42)

    // ── Items ─────────────────────────────────────────────────────────────
    .text(formatItemLine(2, 'Skateboard Deck', '€ 79,00'))
    .text(`    a € 39,50  (21%)\n`)
    .text(formatItemLine(1, 'Pro Trucks Set', '€ 54,99'))
    .text(`    a € 54,99  (21%)\n`)
    .text(formatItemLine(4, 'Bearing Spacers', '€ 11,96'))
    .text(`    a € 2,99  (21%)\n`)
    .separator('-', 42)

    // ── Totals ────────────────────────────────────────────────────────────
    .text(formatTotalLine('Subtotaal', '€ 145,95'))
    .separator('-', 42)
    .bold(true).doubleHeight()
    .text(formatTotalLine('TOTAAL', '€ 145,95'))
    .bold(false).normalSize()
    .separator('-', 42)

    // ── BTW ───────────────────────────────────────────────────────────────
    .text('BTW UITSPLITSING\n')
    .text(`${'21%'.padEnd(8)}${'€ 120,62'.padStart(10)}${'€ 25,33'.padStart(9)}${'€ 145,95'.padStart(10)}\n`)
    .separator('-', 42)

    // ── Betaling ──────────────────────────────────────────────────────────
    .text(formatTotalLine('Betaling', 'Cash'))
    .text(formatTotalLine('Ontvangen', '€ 150,00'))
    .text(formatTotalLine('Wisselgeld', '€ 4,05'))
    .separator('-', 42)

    // ── Footer ────────────────────────────────────────────────────────────
    .alignCenter()
    .text('Bedankt voor uw aankoop!\n')
    .text('Dit ticket dient als geldig betalingsbewijs.\n')
    .text('BTW inbegrepen - bewaar uw ticket.\n')
    .feedLines(4)
    .cut()
    .build();
}
