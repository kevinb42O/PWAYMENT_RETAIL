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
import { useCustomers } from '../store/useCustomers';
import { EscPosBuilder, formatItemLine, formatTotalLine } from '../utils/escpos';
import { receiptPaymentRows } from '../utils/receiptPayments';
import { transactionTenders } from '../utils/financial';
import { formatReceiptBarcode, isValidReceiptBarcode } from '../utils/receiptBarcode';
import {
  useThermalPrinter,
  EPSON_VENDOR_ID,
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
    const merchant = t.merchantSnapshot ?? getMerchantProfileSnapshot();
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
    const tenders = transactionTenders(t);
    if (t.paymentMethod === 'Split' && tenders.length > 0) {
      b.text('Betalingen:\n');
      for (const row of receiptPaymentRows(t)) {
        b.text(formatTotalLine(`  ${row.label}`, fmt(row.amountCents)));
      }
      const cashTender = tenders.find((x) => x.method === 'Cash');
      if (cashTender && t.tenderedCents != null) {
        b.text(formatTotalLine('Ontvangen (Cash)', fmt(t.tenderedCents)));
        const change = Math.max(0, t.tenderedCents - cashTender.amountCents);
        b.text(formatTotalLine('Wisselgeld', fmt(change)));
      }
    } else {
      if (t.paymentMethod === 'Cadeaubon' && t.giftCardAllocations?.length) {
        for (const row of receiptPaymentRows(t)) {
          b.text(formatTotalLine(row.label, fmt(row.amountCents)));
        }
      } else {
        b.text(formatTotalLine('Betaling', t.paymentMethod));
      }
      if (t.paymentMethod === 'Cash' && t.tenderedCents != null) {
        const change = Math.max(0, t.tenderedCents - t.totalCents);
        b.text(formatTotalLine('Ontvangen', fmt(t.tenderedCents)));
        b.text(formatTotalLine('Wisselgeld', fmt(change)));
      }
    }

    for (const allocation of t.giftCardAllocations ?? []) {
      if (allocation.balanceAfterCents != null) {
        b.text(
          formatTotalLine(
            `Resterend saldo (${allocation.code})`,
            fmt(allocation.balanceAfterCents),
          ),
        );
      }
    }

    if (t.customerId) {
      const customers = useCustomers.getState().customers;
      const customer = customers.find((c) => c.id === t.customerId);
      b.text(formatTotalLine('Klant', customer ? customer.name : t.customerId));
    }

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

    if (isValidReceiptBarcode(t.receiptBarcode)) {
      b.separator('-', 42);
      b.alignCenter();
      b.code128C(t.receiptBarcode!);
      b.text(`\n${formatReceiptBarcode(t.receiptBarcode)}\n`);
    }

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

export interface ThermalPrinterModel {
  id: string;
  name: string;
  series: string;
  vid?: number;
  pid?: number;
  protocol: string;
  paperSizes: Array<'80mm' | '58mm'>;
  speed: string;
  description: string;
}

export interface ThermalPrinterBrand {
  id: string;
  name: string;
  tagline: string;
  vid?: number;
  models: ThermalPrinterModel[];
}

export const THERMAL_PRINTER_CATALOG: ThermalPrinterBrand[] = [
  {
    id: 'epson',
    name: 'Epson',
    tagline: 'Marktleider in POS & Thermische Bonprinters',
    vid: EPSON_VENDOR_ID,
    models: [
      {
        id: 'epson-t20ii',
        name: 'TM-T20II / TM-T20III',
        series: 'Retail Direct Series',
        vid: EPSON_VENDOR_ID,
        pid: EPSON_PRODUCT_IDS.TM_T20II_B,
        protocol: 'ESC/POS Standard',
        paperSizes: ['80mm', '58mm'],
        speed: '200 mm/s',
        description: 'Standaard betrouwbare retail USB bonprinter met automatische papierafsnijder.',
      },
      {
        id: 'epson-m30',
        name: 'TM-m30 / TM-m30II / TM-m30III',
        series: 'Compact Cube Series',
        vid: EPSON_VENDOR_ID,
        pid: 0x0e2b,
        protocol: 'ePOS-Print / ESC/POS',
        paperSizes: ['80mm', '58mm'],
        speed: '250 mm/s',
        description: 'Ultra-compacte kubusbonprinter voor iPad & tablet kassasystemen.',
      },
      {
        id: 'epson-m50',
        name: 'TM-m50',
        series: 'High-End POS Cube',
        vid: EPSON_VENDOR_ID,
        pid: 0x0e35,
        protocol: 'ePOS-Print / ESC/POS',
        paperSizes: ['80mm'],
        speed: '350 mm/s',
        description: 'Stijlvolle high-speed kubusbonprinter met meervoudige connectiviteit.',
      },
      {
        id: 'epson-t88vi',
        name: 'TM-T88V / TM-T88VI / TM-T88VII',
        series: 'Enterprise High-Speed Series',
        vid: EPSON_VENDOR_ID,
        pid: EPSON_PRODUCT_IDS.TM_T88V,
        protocol: 'ESC/POS High-Speed',
        paperSizes: ['80mm'],
        speed: '500 mm/s',
        description: 'Vlaggenschip bonprinter voor drukke retail winkels, supermarkten en horeca.',
      },
      {
        id: 'epson-t70ii',
        name: 'TM-T70II',
        series: 'Front-Loading Series',
        vid: EPSON_VENDOR_ID,
        pid: 0x0e1b,
        protocol: 'ESC/POS Standard',
        paperSizes: ['80mm'],
        speed: '250 mm/s',
        description: 'Onderbouw-kassaprinter met papierinvoer en uitgang aan de voorzijde.',
      },
      {
        id: 'epson-p20-p80',
        name: 'TM-P20 / TM-P80 Mobil',
        series: 'Mobile Handheld Series',
        vid: EPSON_VENDOR_ID,
        pid: 0x0e17,
        protocol: 'ESC/POS Mobile',
        paperSizes: ['58mm', '80mm'],
        speed: '100 mm/s',
        description: 'Mobiele riemprinter voor draadloze verkopen en beurzen.',
      },
      {
        id: 'epson-l90',
        name: 'TM-L90 / L90 Linerfree',
        series: 'Label & Ticket Series',
        vid: EPSON_VENDOR_ID,
        pid: 0x0e08,
        protocol: 'ESC/POS Label Mode',
        paperSizes: ['80mm'],
        speed: '150 mm/s',
        description: 'Kassaprinter geschikt voor zowel bonnen als plakkende barcode-etiketten.',
      },
    ],
  },
  {
    id: 'star',
    name: 'Star Micronics',
    tagline: 'Premium POS & Kiosk Printing Solutions',
    vid: 0x051d,
    models: [
      {
        id: 'star-tsp100iii',
        name: 'TSP100III / TSP143III',
        series: 'eco Retail Series',
        vid: 0x051d,
        pid: 0x0012,
        protocol: 'Star Line / ESC/POS',
        paperSizes: ['80mm'],
        speed: '250 mm/s',
        description: 'Wereldwijde retailstandaard met interne voeding en automatische snijder.',
      },
      {
        id: 'star-tsp654ii',
        name: 'TSP654II',
        series: 'High Performance Series',
        vid: 0x051d,
        pid: 0x0005,
        protocol: 'Star Line Mode',
        paperSizes: ['80mm'],
        speed: '300 mm/s',
        description: 'Snel en veelzijdig werkpaard voor detailhandel en keukentickets.',
      },
      {
        id: 'star-mpop',
        name: 'mPOP All-in-One',
        series: 'Integrated Cash Drawer POS',
        vid: 0x051d,
        pid: 0x0024,
        protocol: 'Star mPOP Protocol',
        paperSizes: ['58mm'],
        speed: '100 mm/s',
        description: 'Geïntegreerde bluetooth & USB bonprinter gecombineerd met elektrische kassalade.',
      },
      {
        id: 'star-mcprint3',
        name: 'mC-Print2 / mC-Print3',
        series: 'mCollection Modern POS',
        vid: 0x051d,
        pid: 0x0033,
        protocol: 'Star PRNT Protocol',
        paperSizes: ['80mm', '58mm'],
        speed: '250 mm/s',
        description: 'Strakke minimalistische kubusprinter met bescherming tegen vocht en vuil.',
      },
      {
        id: 'star-sm-l200',
        name: 'SM-S230i / SM-L200 / SM-T300i',
        series: 'Portable Mobile POS',
        vid: 0x051d,
        pid: 0x001a,
        protocol: 'Star Portable Mode',
        paperSizes: ['58mm', '80mm'],
        speed: '80 mm/s',
        description: 'Draagbare bluetooth/USB bonprinter voor ambulante retail.',
      },
    ],
  },
  {
    id: 'bixolon',
    name: 'Bixolon (Samsung)',
    tagline: 'Industriële Kassa & Logistieke Hardware',
    vid: 0x154f,
    models: [
      {
        id: 'bixolon-srp350iii',
        name: 'SRP-350III / SRP-350plusIII',
        series: 'Direct Thermal POS',
        vid: 0x154f,
        pid: 0x0002,
        protocol: 'Bixolon ESC/POS',
        paperSizes: ['80mm'],
        speed: '300 mm/s',
        description: 'Robuuste en uiterst betrouwbare thermische bonprinter met anti-jam technologie.',
      },
      {
        id: 'bixolon-srp330ii',
        name: 'SRP-330II',
        series: 'Economy POS Series',
        vid: 0x154f,
        pid: 0x0006,
        protocol: 'Bixolon ESC/POS',
        paperSizes: ['80mm', '58mm'],
        speed: '220 mm/s',
        description: 'Kostenefficiënte retail-bonprinter met drievoudige interface.',
      },
      {
        id: 'bixolon-srpq300',
        name: 'SRP-Q300',
        series: 'Cube POS Series',
        vid: 0x154f,
        pid: 0x001c,
        protocol: 'Bixolon ESC/POS',
        paperSizes: ['80mm'],
        speed: '220 mm/s',
        description: 'Ultra-kleine kubusprinter met uitgang naar keuze aan boven- of voorzijde.',
      },
      {
        id: 'bixolon-sppr200',
        name: 'SPP-R200III / SPP-R310',
        series: 'Mobile Receipt Series',
        vid: 0x154f,
        pid: 0x0010,
        protocol: 'Bixolon Mobile',
        paperSizes: ['58mm', '80mm'],
        speed: '100 mm/s',
        description: 'Valbestendige mobiele bonprinter met IP54 beschermingsklasse.',
      },
      {
        id: 'bixolon-bk331',
        name: 'BK3-31 Kiosk',
        series: 'Embedded Kiosk Series',
        vid: 0x154f,
        pid: 0x0020,
        protocol: 'Bixolon Kiosk Protocol',
        paperSizes: ['80mm'],
        speed: '250 mm/s',
        description: 'Inbouw bonprinter voor self-service kassa-kiosken.',
      },
    ],
  },
  {
    id: 'citizen',
    name: 'Citizen Systems',
    tagline: 'Duurzame Japanse Precisie-Printers',
    vid: 0x076b,
    models: [
      {
        id: 'citizen-cts310ii',
        name: 'CT-S310II',
        series: 'Eco POS Series',
        vid: 0x076b,
        pid: 0x0002,
        protocol: 'Citizen ESC/POS',
        paperSizes: ['80mm', '58mm'],
        speed: '160 mm/s',
        description: 'Energiezuinige retailbonprinter met verlaagd stroom- en papierverbruik.',
      },
      {
        id: 'citizen-cte351',
        name: 'CT-E351 / CT-E651',
        series: 'Front-Exit Design Series',
        vid: 0x076b,
        pid: 0x0008,
        protocol: 'Citizen ESC/POS',
        paperSizes: ['80mm'],
        speed: '300 mm/s',
        description: 'Front-output bonprinter die beschermt tegen spatwater en stof.',
      },
      {
        id: 'citizen-cts851ii',
        name: 'CT-S651II / CT-S851II',
        series: 'Heavy Duty Premium Series',
        vid: 0x076b,
        pid: 0x000c,
        protocol: 'Citizen High-Speed',
        paperSizes: ['80mm'],
        speed: '350 mm/s',
        description: 'Heavy-duty topsnelheid bonprinter met grafisch LCD-scherm.',
      },
    ],
  },
  {
    id: 'custom',
    name: 'Metapace & Custom',
    tagline: 'Retail POS & Kiosk Specialisten',
    vid: 0x1504,
    models: [
      {
        id: 'metapace-t3',
        name: 'Metapace T-3 / T-4',
        series: 'Retail Workhorse',
        vid: 0x1504,
        pid: 0x0001,
        protocol: 'ESC/POS Compatible',
        paperSizes: ['80mm'],
        speed: '250 mm/s',
        description: 'Complete kassa-set printer met auto-cutter en RJ11 aansluiting.',
      },
      {
        id: 'custom-kubeii',
        name: 'Custom Kube II',
        series: 'Heavy Duty Kiosk & Hospitality',
        vid: 0x0dd4,
        pid: 0x01a0,
        protocol: 'Custom Command Suite',
        paperSizes: ['80mm'],
        speed: '250 mm/s',
        description: 'Industriële kassaprinter voor drukke winkelketens en ticketing.',
      },
    ],
  },
  {
    id: 'generic',
    name: 'Generieke USB ESC/POS',
    tagline: 'Universele WebUSB Endpoint Auto-Detectie',
    models: [
      {
        id: 'generic-escpos-auto',
        name: 'Generieke USB Bonprinter (Auto Endpoint)',
        series: 'Universal Raw Class 7',
        protocol: 'Raw ESC/POS Endpoint',
        paperSizes: ['80mm', '58mm'],
        speed: 'Variabel',
        description: 'Maakt automatisch verbinding met elk merk USB thermische printer via USB Class 7.',
      },
    ],
  },
];

const StatusBadge: React.FC<{ status: PrinterStatus }> = ({ status }) => {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isPrinting = status === 'printing';

  return (
    <div
      className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-2 border ${
        isConnected || isPrinting
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : isConnecting
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected || isPrinting ? 'bg-emerald-500' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
        }`}
      />
      <span>{isPrinting ? 'Afdrukken…' : isConnected ? 'Verbonden' : isConnecting ? 'Verbinden…' : 'Niet Verbonden'}</span>
    </div>
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

export const ThermalPrinterPanel: React.FC<Props> = ({
  transaction,
  onPrintSuccess,
  onPrintError,
}) => {
  const { status, isConnected, error, connect, disconnect, sendRaw } =
    useThermalPrinter();

  const [selectedBrandId, setSelectedBrandId] = React.useState<string>('epson');

  const selectedBrand = React.useMemo(() => {
    return THERMAL_PRINTER_CATALOG.find((b) => b.id === selectedBrandId) || THERMAL_PRINTER_CATALOG[0];
  }, [selectedBrandId]);

  const [selectedModelId, setSelectedModelId] = React.useState<string>('epson-t20ii');

  // Auto-select first model when brand changes
  React.useEffect(() => {
    if (selectedBrand.models.length > 0 && !selectedBrand.models.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(selectedBrand.models[0].id);
    }
  }, [selectedBrand, selectedModelId]);

  const selectedModel = React.useMemo(() => {
    return selectedBrand.models.find((m) => m.id === selectedModelId) || selectedBrand.models[0];
  }, [selectedBrand, selectedModelId]);

  // ── Connect handler ─────────────────────────────────────────────────────

  const handleConnect = useCallback(() => {
    void connect(selectedModel?.pid, selectedModel?.vid || selectedBrand.vid);
  }, [connect, selectedModel, selectedBrand]);

  // ── Print handler ───────────────────────────────────────────────────────

  const handlePrint = useCallback(async () => {
    try {
      let bytes: Uint8Array;

      if (transaction) {
        const adapter = new EscPosPrintAdapter(sendRaw);
        await adapter.printReceipt(transaction);
        bytes = new Uint8Array(0);
      } else {
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
    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 text-slate-900 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <h4 className="font-black text-sm text-slate-900 uppercase tracking-wide">
            Thermische Bonprinter Selectie & Verbinding
          </h4>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Selecteer uw merk en specifiek printermodel voor optimale driver-communicatie
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* STAP 1: MERK SELECTIE (BRAND SELECTOR) */}
      <div className="space-y-2">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
          Stap 1: Kies het Merk van de Bonprinter
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {THERMAL_PRINTER_CATALOG.map((b) => {
            const isSelected = selectedBrandId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBrandId(b.id)}
                className={`py-3 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white font-extrabold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100 font-bold'
                }`}
              >
                <div className="text-xs font-extrabold truncate">{b.name}</div>
                <div className={`text-[10px] font-semibold mt-0.5 truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                  {b.models.length} {b.models.length === 1 ? 'model' : 'modellen'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STAP 2: MODEL SELECTIE (MODEL SELECTOR GRID) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
            Stap 2: Kies het Specifieke Model van {selectedBrand.name}
          </label>
          <span className="text-xs text-slate-500 font-medium">{selectedBrand.tagline}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {selectedBrand.models.map((m) => {
            const isSelected = selectedModelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModelId(m.id)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-slate-900 bg-white ring-2 ring-slate-900 shadow-2xs'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-extrabold text-xs text-slate-900">{m.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[10px] font-bold rounded-md">
                      {m.speed}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">{m.series}</div>
                  <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-relaxed">{m.description}</p>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">{m.protocol}</span>
                  <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {m.paperSizes.join(' / ')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SELECTED MODEL DETAILS & VERBINDEN BUTTON */}
      {selectedModel && (
        <div className="p-5 bg-white rounded-2xl border border-slate-200/90 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Actieve Printer Driver Configuratieset: <span className="font-black underline">{selectedBrand.name} {selectedModel.name}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Protocol: <span className="font-mono font-bold text-slate-800">{selectedModel.protocol}</span> | Aanbevolen Bonformaat: <span className="font-bold text-slate-800">{selectedModel.paperSizes.join(', ')}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isConnected ? (
                <button
                  id="thermal-printer-connect-btn"
                  onClick={handleConnect}
                  disabled={status === 'connecting'}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {status === 'connecting' ? 'Verbinden…' : `Verbinden met ${selectedBrand.name} ${selectedModel.name}`}
                </button>
              ) : (
                <button
                  id="thermal-printer-disconnect-btn"
                  onClick={() => void disconnect()}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Verbreken
                </button>
              )}

              <button
                id="thermal-printer-print-btn"
                onClick={() => void handlePrint()}
                disabled={!isConnected || status === 'printing'}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {status === 'printing' ? 'Afdrukken…' : 'Testbon afdrukken'}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium"
            >
              <strong>Foutmelding:</strong> {error}
            </div>
          )}
        </div>
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
