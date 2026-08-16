import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { formatReceiptBarcode, isValidReceiptBarcode } from "../utils/receiptBarcode";

export const ReceiptBarcode: React.FC<{ value?: string; className?: string }> = ({ value, className }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value || !isValidReceiptBarcode(value)) return;
    JsBarcode(svgRef.current, value, {
      format: "CODE128C",
      displayValue: false,
      margin: 0,
      height: 48,
      width: 1.35,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [value]);

  if (!value || !isValidReceiptBarcode(value)) return null;
  return (
    <div className={className} aria-label={`Retourcode ${formatReceiptBarcode(value)}`}>
      <svg ref={svgRef} role="img" aria-label={`Barcode ${formatReceiptBarcode(value)}`} />
      <div className="mt-1 text-center font-mono text-[9px] tracking-[0.08em]">{formatReceiptBarcode(value)}</div>
    </div>
  );
};
