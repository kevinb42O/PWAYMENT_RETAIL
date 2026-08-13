export const CUSTOMER_DISPLAY_SESSION_STORAGE_KEY =
  "pwayment:customer-display-session-v1";

const createSessionId = (): string => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Veilige displaysessie kan niet worden aangemaakt.");
  }
  return globalThis.crypto.randomUUID();
};
let inMemorySessionId: string | null = null;

export const getLocalCustomerDisplaySessionId = (): string => {
  if (inMemorySessionId) return inMemorySessionId;
  try {
    const stored = globalThis.sessionStorage?.getItem(
      CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
    );
    if (stored) {
      inMemorySessionId = stored;
      return stored;
    }
  } catch {
    // A same-tab in-memory session still works in hardened storage contexts.
  }
  inMemorySessionId = createSessionId();
  try {
    globalThis.sessionStorage?.setItem(
      CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
      inMemorySessionId,
    );
  } catch {
    // Keep the in-memory fallback.
  }
  return inMemorySessionId;
};

export const customerDisplayChannelName = (sessionId: string): string =>
  `pwayment:customer-display:${sessionId}`;

export const customerDisplayPath = (sessionId: string): string =>
  `/customer-display#session=${encodeURIComponent(sessionId)}`;

export const openLocalCustomerDisplay = (): Window | null => {
  const sessionId = getLocalCustomerDisplaySessionId();
  return window.open(
    customerDisplayPath(sessionId),
    "pwayment-customer-display",
    "popup=yes,width=1280,height=720,resizable=yes,scrollbars=no",
  );
};

export const readCustomerDisplaySessionFromLocation = (): string | null => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = params.get("session")?.trim();
  return session && session.length >= 16 ? session : null;
};
