import React, { useEffect, useState } from 'react';
import { ExternalLink, Monitor, Smartphone, Tablet, X } from 'lucide-react';
import { useWebshopStore } from '../store/useWebshopStore';

interface WebshopPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

const viewportWidths: Record<ViewportMode, string> = {
  desktop: '100%',
  tablet: '820px',
  mobile: '390px',
};

export const WebshopPreviewModal: React.FC<WebshopPreviewModalProps> = ({ isOpen, onClose }) => {
  const webshop = useWebshopStore();
  const [viewport, setViewport] = useState<ViewportMode>('desktop');

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label="Webshop preview">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-white sm:px-5">
        <div className="min-w-0">
          <div className="truncate text-xs font-black sm:text-sm">{webshop.shopName}</div>
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Webshopvoorbeeld</div>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1">
          {([
            ['desktop', Monitor, 'Desktop'],
            ['tablet', Tablet, 'Tablet'],
            ['mobile', Smartphone, 'Mobiel'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewport(id)}
              aria-pressed={viewport === id}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-bold transition sm:px-3 ${viewport === id ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a href="/shop" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black text-slate-200 transition hover:border-sky-500 hover:text-white">
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Open webshop</span>
          </a>
          <button type="button" onClick={onClose} aria-label="Preview sluiten" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white">
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 justify-center overflow-hidden bg-slate-900/80 p-0 sm:p-3">
        <div
          className={`h-full overflow-hidden bg-white transition-[width,border-radius] duration-300 ${viewport === 'desktop' ? '' : 'rounded-[1.5rem] border-[6px] border-slate-800 shadow-2xl'}`}
          style={{ width: viewportWidths[viewport] }}
        >
          <iframe src="/shop?preview=1" title="Webshopvoorbeeld" className="h-full w-full border-0 bg-white" />
        </div>
      </div>
    </div>
  );
};
