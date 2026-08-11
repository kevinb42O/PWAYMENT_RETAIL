import { create } from "zustand";
import { persist } from "zustand/middleware";
import { db } from "../db/db";
import { hashCredential, verifyCredential } from "../utils/credentials";
import { AuditAction, AuditEntry, Role, User } from "../types";

interface AuthState {
  currentUserId: string | null;
  currentUserName: string | null;
  currentRole: Role | null;
  currentStoreName: string | null;
  unlocked: boolean;
  login: (userId: string, pin: string) => Promise<boolean>;
  loginWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  registerAccount: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    storeName: string;
    pin: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  /**
   * Verify a manager/owner PIN without changing the active session.
   * Returns the approving user id, or null if no match.
   */
  verifyManager: (pin: string) => Promise<string | null>;
}

/** Hash a PIN identical to how seed users are stored. */
const hashPin = (pin: string): Promise<string> => hashCredential(pin, "pin");

/** Hash a password for account login. */
const hashPassword = (password: string): Promise<string> =>
  hashCredential(password, "password");

export const DEMO_ACCOUNT_ID = "u-demo-kevin";
const DEMO_ACCOUNT_EMAIL = "kevin@webaanzee.be";
const DEMO_ACCOUNT_PASSWORD_HASH =
  "pbkdf2-sha256$120000$52e83ca7bf08ac7fb1d70002c49962a8$bc09b0f5f1539ac4bf890db2d7e7e2951feb0b8be8adb82e67545939015d776d";
const DEMO_ACCOUNT_PIN_HASH =
  "pbkdf2-sha256$120000$d2d295c66516d097883068ad223ad29f$8966efbc8d08770914305eb59c67e7dcf459ff6b0d1fce1d0b90f70fc658128b";

const ensureDemoAccount = async (): Promise<void> => {
  const existing = await db.users.get(DEMO_ACCOUNT_ID);
  const account: User = {
    id: DEMO_ACCOUNT_ID,
    name: "Kevin · Demo",
    firstName: "Kevin",
    lastName: "Demo",
    role: "owner",
    pinHash: DEMO_ACCOUNT_PIN_HASH,
    email: DEMO_ACCOUNT_EMAIL,
    passwordHash: DEMO_ACCOUNT_PASSWORD_HASH,
    storeName: "PWAYMENT Demo Store",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await db.users.put(account);
};

const prepareDemoPresentation = async (): Promise<void> => {
  const [productsModule, customersModule, storeModule, demoModule] =
    await Promise.all([
      import("../store/useProducts"),
      import("../store/useCustomers"),
      import("../store/useStore"),
      import("../utils/demoRetailData"),
    ]);

  await productsModule.useProducts.getState().hydrate();
  await demoModule.seedDemoRetailData();
  await customersModule.useCustomers.getState().hydrate(true);

  const store = storeModule.useStore.getState();
  store.clearCart();
  store.resetCartExtras();
  store.unlinkCustomer();
  store.setMobileView("menu");
  store.setMainView("pos");
};

const ATTEMPT_STORAGE_KEY = "pwayment:auth-attempts-v1";
const readAttempts = (): Map<
  string,
  { failures: number; blockedUntil: number }
> => {
  try {
    const raw = globalThis.sessionStorage?.getItem(ATTEMPT_STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
};
const loginAttempts = readAttempts();
const persistAttempts = () => {
  try {
    globalThis.sessionStorage?.setItem(
      ATTEMPT_STORAGE_KEY,
      JSON.stringify([...loginAttempts]),
    );
  } catch {
    /* Rate limiting remains active in memory. */
  }
};
const isBlocked = (key: string) => {
  const attempt = loginAttempts.get(key);
  if (!attempt?.blockedUntil) return false;
  if (attempt.blockedUntil > Date.now()) return true;
  loginAttempts.delete(key);
  persistAttempts();
  return false;
};
const recordFailure = (key: string) => {
  const previous = loginAttempts.get(key) ?? { failures: 0, blockedUntil: 0 };
  const failures = previous.failures + 1;
  const blockedUntil =
    failures >= 5
      ? Date.now() +
        Math.min(15 * 60_000, 30_000 * 2 ** Math.min(5, failures - 5))
      : 0;
  loginAttempts.set(key, { failures, blockedUntil });
  persistAttempts();
};
const clearFailures = (key: string) => {
  loginAttempts.delete(key);
  persistAttempts();
};

/** Append an entry to the audit log table. Best-effort — never throws. */
export const audit = async (
  action: AuditAction,
  detail?: unknown,
): Promise<void> => {
  const { currentUserId, currentUserName } = useAuth.getState();
  const entry: AuditEntry = {
    timestamp: Date.now(),
    userId: currentUserId,
    userName: currentUserName,
    action,
    detail,
  };
  try {
    await db.audit.add(entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("audit write failed", err);
  }
};

/** Seed default users on first boot if none exist. PINs are 6 digits. */
export const ensureSeedUsers = async (): Promise<void> => {
  await ensureDemoAccount();

  const fixtureMode =
    import.meta.env.DEV ||
    import.meta.env.VITE_PRESENTATION_BUILD === "true" ||
    import.meta.env.VITE_E2E_BUILD === "true";
  if (!fixtureMode) return;

  const SEED_VERSION = "5";
  const SEED_KEY = "pwayment:seedVersion";
  const seed: Array<{
    id: string;
    name: string;
    role: Role;
    pin: string;
    email?: string;
    storeName?: string;
  }> = [
    {
      id: "u-owner",
      name: "Eigenaar",
      role: "owner",
      pin: "123456",
      email: "eigenaar@pwayment.be",
      storeName: "PWAyment Store",
    },
    {
      id: "u-mgr",
      name: "Manager",
      role: "manager",
      pin: "234567",
      email: "manager@pwayment.be",
      storeName: "PWAyment Store",
    },
    {
      id: "u-w1",
      name: "Kassa 1",
      role: "cashier",
      pin: "111111",
      email: "kassa1@pwayment.be",
      storeName: "PWAyment Store",
    },
    {
      id: "u-w2",
      name: "Kassa 2",
      role: "cashier",
      pin: "222222",
      email: "kassa2@pwayment.be",
      storeName: "PWAyment Store",
    },
  ];

  const stored =
    typeof localStorage !== "undefined" ? localStorage.getItem(SEED_KEY) : null;
  const count = await db.users.count();
  if (count > 0 && stored === SEED_VERSION) return;
  for (const u of seed) {
    const user: User = {
      id: u.id,
      name: u.name,
      role: u.role,
      pinHash: await hashPin(u.pin),
      email: u.email,
      passwordHash: await hashPassword("password123"),
      storeName: u.storeName,
      createdAt: new Date().toISOString(),
    };
    await db.users.put(user);
  }
  if (typeof localStorage !== "undefined")
    localStorage.setItem(SEED_KEY, SEED_VERSION);
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUserId: null,
      currentUserName: null,
      currentRole: null,
      currentStoreName: null,
      unlocked: false,
      async login(userId, pin) {
        const attemptKey = `pin:${userId}`;
        if (isBlocked(attemptKey)) return false;
        const user = await db.users.get(userId);
        if (!user) return false;
        const pinCheck = await verifyCredential(pin, "pin", user.pinHash);
        if (!pinCheck.valid) {
          recordFailure(attemptKey);
          return false;
        }
        if (pinCheck.needsUpgrade) {
          await db.users.update(user.id, { pinHash: await hashPin(pin) });
        }
        clearFailures(attemptKey);
        set({
          currentUserId: user.id,
          currentUserName: user.name,
          currentRole: user.role,
          currentStoreName: user.storeName || null,
          unlocked: true,
        });
        await audit("login", { userId: user.id });
        return true;
      },
      async loginWithEmail(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const attemptKey = `email:${cleanEmail}`;
        if (isBlocked(attemptKey))
          return {
            success: false,
            message: "Te veel mislukte pogingen. Probeer later opnieuw.",
          };
        if (!cleanEmail || !password) {
          return { success: false, message: "Vul alstublieft alle velden in" };
        }
        const users = await db.users.toArray();
        const user = users.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (!user) {
          return {
            success: false,
            message: "Geen account gevonden met dit e-mailadres",
          };
        }
        if (!user.passwordHash) {
          return {
            success: false,
            message:
              "Account heeft geen wachtwoord ingesteld. Gebruik je PIN code.",
          };
        }
        const passwordCheck = await verifyCredential(
          password,
          "password",
          user.passwordHash,
        );
        if (!passwordCheck.valid) {
          recordFailure(attemptKey);
          return { success: false, message: "Ongeldig wachtwoord" };
        }
        if (passwordCheck.needsUpgrade) {
          await db.users.update(user.id, {
            passwordHash: await hashPassword(password),
          });
        }
        if (user.id === DEMO_ACCOUNT_ID) {
          try {
            await prepareDemoPresentation();
          } catch (error) {
            console.error("Demo-omgeving voorbereiden mislukt:", error);
            return {
              success: false,
              message: "De demo-omgeving kon niet worden klaargezet. Probeer opnieuw.",
            };
          }
        }
        clearFailures(attemptKey);
        set({
          currentUserId: user.id,
          currentUserName: user.name,
          currentRole: user.role,
          currentStoreName: user.storeName || null,
          unlocked: true,
        });
        await audit("login", { userId: user.id, email: cleanEmail });
        return { success: true };
      },
      async registerAccount({
        email,
        password,
        firstName,
        lastName,
        storeName,
        pin,
      }) {
        const cleanEmail = email.trim().toLowerCase();
        const cleanFirst = firstName.trim();
        const cleanLast = lastName.trim();
        const cleanStore = storeName.trim();

        if (
          !cleanEmail ||
          !password ||
          !cleanFirst ||
          !cleanLast ||
          !cleanStore
        ) {
          return {
            success: false,
            message: "Vul alstublieft alle verplichte velden in",
          };
        }
        if (password.length < 12) {
          return {
            success: false,
            message: "Wachtwoord moet minstens 12 tekens bevatten",
          };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return { success: false, message: "Vul een geldig e-mailadres in" };
        }
        if (!/^\d{6}$/.test(pin)) {
          return {
            success: false,
            message: "De snel-PIN moet exact 6 cijfers bevatten",
          };
        }
        const users = await db.users.toArray();
        const exists = users.some((u) => u.email?.toLowerCase() === cleanEmail);
        if (exists) {
          return {
            success: false,
            message: "Er bestaat al een account met dit e-mailadres",
          };
        }

        const userId = `u-acc-${globalThis.crypto.randomUUID()}`;
        const pinHash = await hashPin(pin);
        const passwordHash = await hashPassword(password);

        const fullName = `${cleanFirst} ${cleanLast}`;
        const newUser: User = {
          id: userId,
          name: fullName,
          firstName: cleanFirst,
          lastName: cleanLast,
          role: "owner",
          email: cleanEmail,
          passwordHash,
          pinHash,
          storeName: cleanStore,
          createdAt: new Date().toISOString(),
        };

        await db.users.put(newUser);
        set({
          currentUserId: newUser.id,
          currentUserName: newUser.name,
          currentRole: newUser.role,
          currentStoreName: newUser.storeName,
          unlocked: true,
        });
        await audit("register", {
          userId: newUser.id,
          email: cleanEmail,
          storeName: newUser.storeName,
        });
        return { success: true };
      },
      async logout() {
        await audit("logout");
        set({
          currentUserId: null,
          currentUserName: null,
          currentRole: null,
          currentStoreName: null,
          unlocked: false,
        });
      },
      hasRole(...roles) {
        const r = get().currentRole;
        return r != null && roles.includes(r);
      },
      async verifyManager(pin) {
        if (!pin || pin.length < 4) return null;
        const attemptKey = "manager-approval";
        if (isBlocked(attemptKey)) return null;
        const users = await db.users
          .filter((u) => u.role === "owner" || u.role === "manager")
          .toArray();
        let match: User | undefined;
        for (const user of users) {
          const check = await verifyCredential(pin, "pin", user.pinHash);
          if (check.valid) {
            match = user;
            if (check.needsUpgrade) {
              await db.users.update(user.id, { pinHash: await hashPin(pin) });
            }
            break;
          }
        }
        if (!match) {
          recordFailure(attemptKey);
          return null;
        }
        clearFailures(attemptKey);
        await audit("approve", { approverUserId: match.id });
        return match.id;
      },
    }),
    {
      name: "pwayment-auth-v1",
      version: 2,
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        currentUserName: s.currentUserName,
        currentRole: s.currentRole,
        currentStoreName: s.currentStoreName,
        unlocked: false,
      }),
      migrate: (persisted: unknown) => ({
        ...(persisted as object),
        unlocked: false,
      }),
    },
  ),
);
