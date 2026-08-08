import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db } from '../db/db';
import { generateHash } from '../utils/crypto';
import { AuditAction, AuditEntry, Role, User } from '../types';

interface AuthState {
  currentUserId: string | null;
  currentUserName: string | null;
  currentRole: Role | null;
  unlocked: boolean;
  login: (userId: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  /**
   * Verify a manager/owner PIN without changing the active session.
   * Returns the approving user id, or null if no match.
   */
  verifyManager: (pin: string) => Promise<string | null>;
}

/** Hash a PIN identical to how seed users are stored. */
const hashPin = (pin: string): Promise<string> => generateHash(`pwayment:${pin}`);

/** Append an entry to the audit log table. Best-effort â never throws. */
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
    console.warn('audit write failed', err);
  }
};

/** Seed default users on first boot if none exist. PINs are 6 digits. */
export const ensureSeedUsers = async (): Promise<void> => {
  const SEED_VERSION = '3';
  const SEED_KEY = 'pwayment:seedVersion';
  const seed: Array<{ id: string; name: string; role: Role; pin: string }> = [
    { id: 'u-owner', name: 'Eigenaar', role: 'owner', pin: '123456' },
    { id: 'u-mgr', name: 'Manager', role: 'manager', pin: '234567' },
    { id: 'u-w1', name: 'Kassa 1', role: 'cashier', pin: '111111' },
    { id: 'u-w2', name: 'Kassa 2', role: 'cashier', pin: '222222' },
  ];

  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SEED_KEY) : null;
  const count = await db.users.count();
  if (count > 0 && stored === SEED_VERSION) return;
  for (const u of seed) {
    const user: User = {
      id: u.id,
      name: u.name,
      role: u.role,
      pinHash: await hashPin(u.pin),
    };
    await db.users.put(user);
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(SEED_KEY, SEED_VERSION);
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUserId: null,
      currentUserName: null,
      currentRole: null,
      unlocked: false,
      async login(userId, pin) {
        const user = await db.users.get(userId);
        if (!user) return false;
        const pinHash = await hashPin(pin);
        if (pinHash !== user.pinHash) return false;
        set({
          currentUserId: user.id,
          currentUserName: user.name,
          currentRole: user.role,
          unlocked: true,
        });
        await audit('login', { userId: user.id });
        return true;
      },
      async logout() {
        await audit('logout');
        set({
          currentUserId: null,
          currentUserName: null,
          currentRole: null,
          unlocked: false,
        });
      },
      hasRole(...roles) {
        const r = get().currentRole;
        return r != null && roles.includes(r);
      },
      async verifyManager(pin) {
        if (!pin || pin.length < 4) return null;
        const pinHash = await hashPin(pin);
        const users = await db.users
          .filter((u) => u.role === 'owner' || u.role === 'manager')
          .toArray();
        const match = users.find((u) => u.pinHash === pinHash);
        if (!match) return null;
        await audit('approve', { approverUserId: match.id });
        return match.id;
      },
    }),
    {
      name: 'pwayment-auth-v1',
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        currentUserName: s.currentUserName,
        currentRole: s.currentRole,
        unlocked: s.unlocked,
      }),
    },
  ),
);
