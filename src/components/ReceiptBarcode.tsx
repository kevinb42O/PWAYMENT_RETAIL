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
    <div className={`flex flex-col items-center justify-center w-full ${className ?? ""}`} aria-label={`Retourcode ${formatReceiptBarcode(value)}`}>
      <div className="flex w-full items-center justify-center">
        <svg ref={svgRef} className="mx-auto block" role="img" aria-label={`Barcode ${formatReceiptBarcode(value)}`} />
      </div>
      <div className="mt-1 text-center font-mono text-[9.5px] tracking-[0.08em] font-medium">{formatReceiptBarcode(value)}</div>
    </div>
  );
};
