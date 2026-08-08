import React, { useEffect, useState } from 'react';
import { ArrowLeft, Crown, LogIn, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from './useAuth';
import { db } from '../db/db';
import { Role, User } from '../types';
import { ThemeToggle } from '../components/ThemeToggle';

const PIN_LENGTH = 6;

const roleLabel: Record<Role, string> = {
  owner: 'Eigenaar',
  manager: 'Manager',
  cashier: 'Kassamedewerker',
};

const RoleIcon: React.FC<{ role: Role; size?: number }> = ({ role, size = 28 }) => {
  if (role === 'owner') return <Crown size={size} className="text-amber-400" />;
  if (role === 'manager') return <ShieldCheck size={size} className="text-indigo-400" />;
  return <UserIcon size={size} className="text-zinc-400" />;
};

export const LoginScreen: React.FC = () => {
  const login = useAuth((s) => s.login);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    void db.users.toArray().then(setUsers);
  }, []);

  const reset = () => {
    setPin('');
    setError(null);
  };

  const submit = async (candidate: string) => {
    if (!selected) return;
    setIsChecking(true);
    const ok = await login(selected.id, candidate);
    setIsChecking(false);
    if (!ok) {
      setError('PIN incorrect');
      setPin('');
    }
  };

  const handleDigit = (d: string) => {
    if (isChecking) return;
    setError(null);
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      void submit(next);
    }
  };

  const handleBackspace = () => {
    if (isChecking) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-zinc-950 text-white p-6">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 mb-10">
          <ShieldCheck className="text-indigo-400" size={32} />
          <h1 className="text-3xl font-bold">PWAyment &middot; Aanmelden</h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl w-full">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelected(u);
                reset();
              }}
              className="flex flex-col items-center justify-center p-6 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-indigo-500 transition-colors min-h-[140px]"
            >
              <div className="mb-3">
                <RoleIcon role={u.role} size={40} />
              </div>
              <div className="font-bold text-lg">{u.name}</div>
              <div className="text-xs uppercase tracking-widest text-zinc-500 mt-1">
                {roleLabel[u.role]}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-zinc-950 text-white p-6 relative">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <button
        onClick={() => {
          setSelected(null);
          reset();
        }}
        className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white text-sm"
      >
        <ArrowLeft size={16} />
        Andere gebruiker
      </button>

      <div className="flex items-center gap-3 mb-2">
        <RoleIcon role={selected.role} size={24} />
        <div className="text-2xl font-bold">{selected.name}</div>
      </div>
      <div className="text-zinc-500 text-sm mb-8 uppercase tracking-widest">
        {roleLabel[selected.role]}
      </div>

      <div className="flex gap-3 mb-6" aria-label="PIN indicator">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              i < pin.length ? 'bg-indigo-400' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>

      <div className="h-6 mb-2">
        {error && <div className="text-red-400 text-sm font-medium">{error}</div>}
      </div>

      <div className="grid grid-cols-3 gap-3 w-72">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => handleDigit(d)}
            disabled={isChecking}
            className="aspect-square text-2xl font-bold bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-800 rounded-2xl disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={handleBackspace}
          disabled={isChecking}
          className="aspect-square text-sm font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl text-zinc-400 disabled:opacity-50"
        >
          Wis
        </button>
        <button
          onClick={() => handleDigit('0')}
          disabled={isChecking}
          className="aspect-square text-2xl font-bold bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-800 rounded-2xl disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => void submit(pin)}
          disabled={pin.length < PIN_LENGTH || isChecking}
          className="aspect-square flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-500 rounded-2xl"
        >
          <LogIn size={24} />
        </button>
      </div>

      <p className="text-zinc-600 text-[11px] mt-6 max-w-xs text-center">
        Voer je 6-cijferige PIN in. Standaardcodes staan in de README en moeten voor productie
        gewijzigd worden.
      </p>
    </div>
  );
};
