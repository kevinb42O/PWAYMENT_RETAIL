import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { formatReceiptBarcode, isValidReceiptBarcode, normalizeReceiptBarcode } from "../utils/receiptBarcode";

export const ReceiptBarcode: React.FC<{ value?: string; className?: string }> = ({ value, className }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const barcode = normalizeReceiptBarcode(value);

  useEffect(() => {
    if (!svgRef.current || !isValidReceiptBarcode(barcode)) return;
    JsBarcode(svgRef.current, barcode, {
      format: "CODE128C",
      displayValue: false,
      margin: 0,
      height: 48,
      width: 1.35,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [barcode]);

  if (!isValidReceiptBarcode(barcode)) return null;
  return (
    <div className={`flex flex-col items-center justify-center w-full ${className ?? ""}`} aria-label={`Retourcode ${formatReceiptBarcode(barcode)}`}>
      <div className="flex w-full items-center justify-center">
        <svg ref={svgRef} className="mx-auto block" role="img" aria-label={`Barcode ${formatReceiptBarcode(barcode)}`} />
      </div>
      <div className="mt-1 text-center font-mono text-[9.5px] tracking-[0.08em] font-medium">{formatReceiptBarcode(barcode)}</div>
    </div>
  );
};
