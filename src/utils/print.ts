import { Transaction } from '../types';
import { formatEUR } from './money';
import { getMerchantProfileSnapshot } from '../store/useMerchantProfile';
import { receiptPaymentRows } from './receiptPayments';
import { vatBreakdownForTransaction } from './vat';
import { receiptDiscountLabel, receiptDocumentReference } from './receiptPresentation';

/**
 * Receipt printing adapter. The default ConsolePrintAdapter writes a formatted
 * paper-style receipt to the console; replace via setPrintAdapter() with an
 * ESC/POS WebUSB adapter in production.
 */
export interface PrintAdapter {
  printReceipt(transaction: Transaction, options?: { copy?: "original" | "reprint" }): Promise<void>;
}

class ConsolePrintAdapter implements PrintAdapter {
  async printReceipt(t: Transaction, options?: { copy?: "original" | "reprint" }): Promise<void> {
    const merchant = t.merchantSnapshot ?? getMerchantProfileSnapshot();
    const lines: string[] = [];
    lines.push(`-------------------- ${merchant.name} --------------------`);
    if (merchant.legalName && merchant.legalName !== merchant.name) lines.push(merchant.legalName);
    lines.push(merchant.addressLine1);
    lines.push(merchant.addressLine2);
    lines.push(`BTW: ${merchant.vatNumber}`);
    if (merchant.website) lines.push(merchant.website);
    if (options?.copy === "reprint") lines.push('*** HERDRUK ***');
    lines.push(`Ticketnr.: ${receiptDocumentReference(t)}`);
    lines.push(`Kassa ${t.tableId}    ${new Date(t.timestamp).toLocaleString('nl-BE')}`);
    if (t.userName) lines.push(`Kassier: ${t.userName}`);
    lines.push('--------------------------------------------------');
    for (const item of t.items) {
      const modSum = (item.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
      const unit = item.product.priceCents + modSum;
      const line = unit * item.quantity;
      lines.push(
        `${String(item.quantity).padStart(2)}x ${item.product.name.padEnd(30)} ${formatEUR(line).padStart(10)}`,
      );
      for (const mod of item.modifiers ?? []) {
        const delta = mod.deltaCents > 0 ? ` (+${formatEUR(mod.deltaCents)})` : '';
        lines.push(`     + ${mod.label}${delta}`);
      }
      if (item.notes) lines.push(`     ! ${item.notes}`);
    }
    lines.push('--------------------------------------------------');
    lines.push(`Subtotaal:               ${formatEUR(t.subtotalCents)}`);
    if (t.discountCents > 0) lines.push(`${receiptDiscountLabel()}:                -${formatEUR(t.discountCents)}`);
    for (const vat of vatBreakdownForTransaction(t)) {
      lines.push(`BTW ${String(vat.rate).padEnd(2)}%:                 ${formatEUR(vat.vatCents)}`);
    }
    lines.push(`TOTAAL:                  ${formatEUR(t.totalCents)}`);
    lines.push(`Betaald via: ${t.paymentMethod}`);
    if (t.paymentMethod === 'Split' || t.paymentMethod === 'Cadeaubon') {
      for (const row of receiptPaymentRows(t)) {
        lines.push(`${row.label}: ${formatEUR(row.amountCents)}`);
      }
    }
    if (t.paymentMethod === 'Cash' && t.tenderedCents != null) {
      lines.push(`Ontvangen:               ${formatEUR(t.tenderedCents)}`);
      lines.push(`Wisselgeld:              ${formatEUR(Math.max(0, t.tenderedCents - t.totalCents))}`);
    }
    for (const allocation of t.giftCardAllocations ?? []) {
      if (allocation.balanceAfterCents != null) {
        lines.push(
          `Resterend saldo (${allocation.code}): ${formatEUR(allocation.balanceAfterCents)}`,
        );
      }
    }
    if (merchant.footer) lines.push(merchant.footer);
    if (merchant.returnPolicy) lines.push(merchant.returnPolicy);
    if (merchant.email) lines.push(merchant.email);
    lines.push('--------------------------------------------------');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }
}

let adapter: PrintAdapter = new ConsolePrintAdapter();

export const setPrintAdapter = (a: PrintAdapter): void => {
  adapter = a;
};

export const printReceipt = (t: Transaction, options?: { copy?: "original" | "reprint" }): Promise<void> =>
  adapter.printReceipt(t, options);
