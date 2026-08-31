const BLOCKED_PINS = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555",
  "666666", "777777", "888888", "999999", "123456", "654321",
  "012345", "543210", "121212", "112233", "123123",
]);

export const posPinPolicyError = (pin: string): string | null => {
  if (!/^\d{6}$/.test(pin)) return "Kies een persoonlijke PIN van exact 6 cijfers.";
  if (BLOCKED_PINS.has(pin)) return "Kies een minder voorspelbare PIN zonder eenvoudige reeks of herhaling.";
  return null;
};

export const isSafePosPin = (pin: string): boolean => posPinPolicyError(pin) === null;
