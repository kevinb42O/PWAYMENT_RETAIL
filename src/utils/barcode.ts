const EAN13_LEFT_ODD: Record<string, string> = {
  '0': '0001101',
  '1': '0011001',
  '2': '0010011',
  '3': '0111101',
  '4': '0100011',
  '5': '0110001',
  '6': '0101111',
  '7': '0111011',
  '8': '0110111',
  '9': '0001011',
};

const EAN13_LEFT_EVEN: Record<string, string> = {
  '0': '0100111',
  '1': '0110011',
  '2': '0011011',
  '3': '0100001',
  '4': '0011101',
  '5': '0111001',
  '6': '0000101',
  '7': '0010001',
  '8': '0001001',
  '9': '0010111',
};

const EAN13_RIGHT: Record<string, string> = {
  '0': '1110010',
  '1': '1100110',
  '2': '1101100',
  '3': '1000010',
  '4': '1011100',
  '5': '1001110',
  '6': '1010000',
  '7': '1000100',
  '8': '1001000',
  '9': '1110100',
};

const EAN13_PARITY: Record<string, string> = {
  '0': 'OOOOOO',
  '1': 'OOEOEE',
  '2': 'OOEEOE',
  '3': 'OOEEEO',
  '4': 'OEOOEE',
  '5': 'OEEOOE',
  '6': 'OEEEOO',
  '7': 'OEOEOE',
  '8': 'OEOEEO',
  '9': 'OEEOEO',
};

export const calculateEAN13CheckDigit = (first12Digits: string): string => {
  const digits = first12Digits.replace(/\D/g, '').slice(0, 12);
  if (digits.length !== 12) return '0';
  const sum = digits.split('').reduce((acc, digit, index) => {
    const value = Number(digit);
    return acc + value * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (sum % 10)) % 10);
};

export const isValidEAN13 = (barcode?: string): boolean => {
  const digits = (barcode ?? '').replace(/\D/g, '');
  return digits.length === 13 && calculateEAN13CheckDigit(digits.slice(0, 12)) === digits[12];
};

export const normalizeBarcode = (barcode?: string): string => (barcode ?? '').replace(/\D/g, '').slice(0, 13);

const hashToTenDigits = (input: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0).padStart(10, '0').slice(-10);
};

export const generateInternalEAN13 = (seed: string): string => {
  const first12 = `20${hashToTenDigits(seed)}`;
  return `${first12}${calculateEAN13CheckDigit(first12)}`;
};

export const getPrintableBarcode = (currentBarcode: string | undefined, seed: string): string => {
  const normalized = normalizeBarcode(currentBarcode);
  if (isValidEAN13(normalized)) return normalized;
  return generateInternalEAN13(seed);
};

export const encodeEAN13Bits = (barcode: string): string => {
  const digits = normalizeBarcode(barcode);
  if (!isValidEAN13(digits)) return '';
  const parity = EAN13_PARITY[digits[0]];
  const leftDigits = digits.slice(1, 7).split('');
  const rightDigits = digits.slice(7).split('');
  const leftBits = leftDigits
    .map((digit, index) => (parity[index] === 'O' ? EAN13_LEFT_ODD[digit] : EAN13_LEFT_EVEN[digit]))
    .join('');
  const rightBits = rightDigits.map((digit) => EAN13_RIGHT[digit]).join('');
  return `101${leftBits}01010${rightBits}101`;
};
