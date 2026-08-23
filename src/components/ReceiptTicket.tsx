import React from 'react';
import { format } from 'date-fns';
import { Transaction } from '../types';
import { formatEUR } from '../utils/money';
import { MerchantInfo } from '../data/merchant';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { vatBreakdownForTransaction } from '../utils/vat';
import { formatPaymentLabel, receiptPaymentRows } from '../utils/receiptPayments';
import { transactionTenders } from '../utils/financial';
import { settlementTotalCents } from '../utils/cashRounding';
import { ReceiptBarcode } from './ReceiptBarcode';
import {
  receiptDiscountLabel,
  receiptDocumentReference,
  receiptFingerprint,
  receiptItemDescription,
} from '../utils/receiptPresentation';

interface Props {
  transaction: Transaction;
  merchantOverride?: MerchantInfo;
}

/** Pad / align text helpers — keep on-screen receipt aligned like a thermal print. */
const padRight = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

/**
 * Belgian-style retail cash register ticket.
 *
 * Layout matches what a 58-/80-mm thermal printer produces:
 *   - merchant header (name, address, BTW nummer)
 *   - ticket meta (datum, kassier, kassa, transactie nr)
 *   - lines (qty, name, line total) with modifiers/notes indented
 *   - totals + BTW uitsplitsing per tarief (excl/BTW/incl)
 *   - betaling, ontvangen, wisselgeld
 *   - footer
 *
 * The component prints cleanly via window.print() — the parent modal sets
 * a `print:` class so only the receipt appears on paper.
 */
export const ReceiptTicket: React.FC<Props> = ({ transaction: t, merchantOverride }) => {
  const storedMerchant = useMerchantProfile((state) => state.profile);
  const merchant = merchantOverride ?? t.merchantSnapshot ?? storedMerchant;

  const vatBreakdown = vatBreakdownForTransaction(t);
  const vatTotals = vatBreakdown.reduce(
    (sum, line) => ({
      exclCents: sum.exclCents + line.exclCents,
      vatCents: sum.vatCents + line.vatCents,
      grossCents: sum.grossCents + line.grossCents,
    }),
    { exclCents: 0, vatCents: 0, grossCents: 0 },
  );
  const paymentRows = receiptPaymentRows(t);
  const tenders = transactionTenders(t);
  const cashTenderCents = tenders
    .filter((tender) => tender.method === 'Cash')
    .reduce((sum, tender) => sum + tender.amountCents, 0);
  const settlementTotal = settlementTotalCents(t);

  return (
    <div
      className="receipt-ticket-preview bg-white text-black mx-auto font-mono text-[11px] leading-snug print:shadow-none shadow-2xl print:border-none border border-zinc-300 print:p-0 p-4"
      style={{ width: '320px', minHeight: '420px', colorScheme: 'light' }}
      data-testid="receipt-ticket-preview"
    >
      {/* Header */}
      <div className="text-center mb-2">
        <div className="font-bold text-sm uppercase tracking-wide">{merchant.name}</div>
        {merchant.legalName && merchant.legalName !== merchant.name && <div>{merchant.legalName}</div>}
        <div>{merchant.addressLine1}</div>
        <div>{merchant.addressLine2}</div>
        <div className="mt-1">BTW: {merchant.vatNumber}</div>
        {merchant.phone && <div>Tel: {merchant.phone}</div>}
      </div>

      <Sep />

      {/* Meta */}
      <div className="space-y-0.5">
        <Row left="Datum" right={format(t.timestamp, 'dd/MM/yyyy HH:mm')} />
        <Row left="Ticketnr." right={receiptDocumentReference(t)} />
        <Row left="Kassa" right={`${t.tableId}`} />
        {t.userName && <Row left="Kassier" right={t.userName} />}
      </div>

      <Sep />

      {/* Lines */}
      <div className="space-y-1">
        {t.items.map((item, idx) => {
          const modSum = (item.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);
          const unit = item.product.priceCents + modSum;
          const lineTotal = unit * item.quantity;
          return (
            <div key={item.lineId ?? idx}>
              <div className="flex justify-between gap-2">
                <span className="min-w-0 break-words pr-2">
                  {padRight(`${item.quantity}x`, 4)}
                  {receiptItemDescription(item)}
                </span>
                <span className="tabular-nums whitespace-nowrap">{formatEUR(lineTotal)}</span>
              </div>
              <div className="text-zinc-600 text-[10px] pl-7">
                {item.giftCardOperation
                  ? `Nieuw saldo ${item.giftCardOperation.action === "issue" ? formatEUR(lineTotal) : "na oplading zichtbaar in historiek"}`
                  : <>à {formatEUR(unit)}{`  (${item.product.vatRate ?? 21}%)`}</>}
              </div>
              {(item.modifiers ?? []).map((m) => (
                <div key={m.id} className="pl-7 flex justify-between text-[10px]">
                  <span>+ {m.label}</span>
                  {m.deltaCents > 0 && (
                    <span className="tabular-nums">{formatEUR(m.deltaCents * item.quantity)}</span>
                  )}
                </div>
              ))}
              {item.notes && (
                <div className="pl-7 text-[10px] italic">! {item.notes}</div>
              )}
            </div>
          );
        })}
      </div>

      <Sep />

      {/* Totals */}
      <div className="space-y-0.5">
        <Row left="Subtotaal" right={formatEUR(t.subtotalCents)} />
        {t.discountCents > 0 && (
          <Row
            left={receiptDiscountLabel()}
            right={`-${formatEUR(t.discountCents)}`}
          />
        )}
      </div>

      <Sep />

      <div className="flex justify-between font-bold text-base">
        <span>TOTAAL</span>
        <span className="tabular-nums">{formatEUR(t.totalCents)}</span>
      </div>
      {(t.roundingAdjustmentCents ?? 0) !== 0 && (
        <>
          <Row
            left="Afronding cash"
            right={`${(t.roundingAdjustmentCents ?? 0) > 0 ? '+' : ''}${formatEUR(t.roundingAdjustmentCents ?? 0)}`}
          />
          <div className="flex justify-between font-bold">
            <span>TE VEREFFENEN</span>
            <span className="tabular-nums">{formatEUR(settlementTotal)}</span>
          </div>
        </>
      )}

      <Sep />

      {/* BTW uitsplitsing — required by Belgian fiscal rules. */}
      <div className="space-y-0.5">
        <div className="font-bold mb-0.5">BTW UITSPLITSING</div>
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 text-[10px]">
          <span></span>
          <span className="text-right">Excl.</span>
          <span className="text-right">BTW</span>
          <span className="text-right">Incl.</span>

          {vatBreakdown.map((line) => (
            <React.Fragment key={line.rate}>
              <span>{line.rate}%</span>
              <span className="text-right tabular-nums">{formatEUR(line.exclCents)}</span>
              <span className="text-right tabular-nums">{formatEUR(line.vatCents)}</span>
              <span className="text-right tabular-nums">{formatEUR(line.grossCents)}</span>
            </React.Fragment>
          ))}

          <span className="font-bold">Totaal</span>
          <span className="text-right tabular-nums font-bold">
            {formatEUR(vatTotals.exclCents)}
          </span>
          <span className="text-right tabular-nums font-bold">
            {formatEUR(vatTotals.vatCents)}
          </span>
          <span className="text-right tabular-nums font-bold">
            {formatEUR(vatTotals.grossCents)}
          </span>
        </div>
      </div>

      <Sep />

      {/* Betaling */}
      <div className="space-y-0.5">
        {t.paymentMethod === 'Split' && tenders.length > 0 ? (
          <>
            <div className="font-bold mb-0.5">Betalingen</div>
            {paymentRows.map((row, i) => (
              <Row key={`${row.method}-${row.label}-${i}`} left={row.label} right={formatEUR(row.amountCents)} />
            ))}
            {t.tenderedCents != null && tenders.some((x) => x.method === 'Cash') && (
              <>
                <Row left="Ontvangen (Cash)" right={formatEUR(t.tenderedCents)} />
                <Row
                  left="Wisselgeld"
                  right={formatEUR(
                    Math.max(
                      0,
                      t.tenderedCents -
                        cashTenderCents,
                    ),
                  )}
                />
              </>
            )}
          </>
        ) : (
          <>
            {t.paymentMethod === 'Cadeaubon' && t.giftCardAllocations?.length ? (
              paymentRows.map((row, i) => (
                <Row
                  key={`${row.method}-${row.label}-${i}`}
                  left={row.label}
                  right={formatEUR(row.amountCents)}
                />
              ))
            ) : (
              <Row left="Betaling" right={formatPaymentLabel(t.paymentMethod)} />
            )}
            {t.paymentMethod === 'Cash' && t.tenderedCents != null && (
              <>
                <Row left="Ontvangen" right={formatEUR(t.tenderedCents)} />
                <Row left="Wisselgeld" right={formatEUR(Math.max(0, t.tenderedCents - cashTenderCents))} />
              </>
            )}
          </>
        )}
        {t.giftCardAllocations?.map((allocation) =>
          allocation.balanceAfterCents != null ? (
            <Row
              key={`gift-card-balance-${allocation.giftCardId}`}
              left={`Resterend saldo (${allocation.code})`}
              right={formatEUR(allocation.balanceAfterCents)}
            />
          ) : null,
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] mt-2">
        {merchant.footer && <div className="font-bold">{merchant.footer}</div>}
        {merchant.returnPolicy && <div className="mt-1">{merchant.returnPolicy}</div>}
        {merchant.email && <div className="mt-1">{merchant.email}</div>}
        {merchant.website && <div>{merchant.website}</div>}
        <div className="mt-2">
          Dit ticket dient als geldig betalingsbewijs.
          <br />
          BTW inbegrepen — bewaar uw ticket.
        </div>
        <div className="mt-2 break-all opacity-60">
          {receiptFingerprint(t, format(t.timestamp, 'yyyyMMdd-HHmmss'))}
        </div>
      </div>

      {t.receiptBarcode && <Sep />}

      {t.receiptBarcode && (
        <div className="my-3 flex flex-col items-center justify-center text-center">
          <ReceiptBarcode value={t.receiptBarcode} />
          <span className="mt-1 text-[9px]">Voor retour of omruiling in deze winkel.</span>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ left: string; right: string }> = ({ left, right }) => (
  <div className="flex justify-between gap-2">
    <span>{left}</span>
    <span className="tabular-nums whitespace-nowrap">{right}</span>
  </div>
);

const Sep: React.FC = () => <div className="border-t border-dashed border-zinc-400 my-2" />;
