import React from 'react';
import { encodeEAN13Bits, normalizeBarcode } from '../utils/barcode';

interface Props {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}

export const BarcodeSvg: React.FC<Props> = ({ value, height = 54, showText = true, className }) => {
  const digits = normalizeBarcode(value);
  const bits = encodeEAN13Bits(digits);
  const barHeight = showText ? height - 14 : height;
  const moduleWidth = 1;
  const quietZone = 9;
  const width = bits.length + quietZone * 2;

  if (!bits) {
    return <div className={className}>Ongeldige barcode</div>;
  }

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Barcode ${digits}`}>
      <rect width={width} height={height} fill="white" />
      {bits.split('').map((bit, index) =>
        bit === '1' ? (
          <rect key={index} x={quietZone + index} y={0} width={moduleWidth} height={barHeight} fill="black" />
        ) : null,
      )}
      {showText && (
        <text x={width / 2} y={height - 2} textAnchor="middle" fontFamily="monospace" fontSize="9" fill="black">
          {digits}
        </text>
      )}
    </svg>
  );
};
