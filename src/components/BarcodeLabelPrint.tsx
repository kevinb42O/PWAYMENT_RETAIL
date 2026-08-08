import React, { useMemo, useState } from 'react';
import { Barcode, Printer, Wand2 } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { Product } from '../types';
import { formatEUR } from '../utils/money';
import { generateInternalEAN13, getPrintableBarcode, isValidEAN13 } from '../utils/barcode';
import { BarcodeSvg } from './BarcodeSvg';

const labelPresets = {
  sheet: { label: 'A4 stickervel 70 x 36 mm', cls: 'grid-cols-3', style: { width: '70mm', height: '36mm' } },
  roll: { label: 'Labelprinter 58 x 32 mm', cls: 'grid-cols-1', style: { width: '58mm', height: '32mm' } },
} as const;

type LabelPreset = keyof typeof labelPresets;

export const BarcodeLabelPrint: React.FC = () => {
  const list = useProducts((state) => state.list);
  const upsert = useProducts((state) => state.upsert);
  const activeProducts = list.filter((product) => product.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<LabelPreset>('sheet');
  const [includePrice, setIncludePrice] = useState(true);
  const [includeSku, setIncludeSku] = useState(true);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((product) =>
      [product.name, product.brand, product.variant, product.sku, product.barcode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [activeProducts, search]);

  const labels = useMemo(() => {
    return activeProducts.flatMap((product) => {
      const quantity = selected[product.id] ?? 0;
      const barcode = getPrintableBarcode(product.barcode, product.id);
      return Array.from({ length: quantity }, (_, index) => ({ product, barcode, key: `${product.id}-${index}` }));
    });
  }, [activeProducts, selected]);

  const setQuantity = (productId: string, quantity: number) => {
    setSelected((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(99, Math.floor(quantity));
      return next;
    });
  };

  const generateMissing = async () => {
    for (const product of activeProducts) {
      if (!isValidEAN13(product.barcode)) {
        await upsert({ ...product, barcode: generateInternalEAN13(product.id) });
      }
    }
  };

  const printLabels = async () => {
    for (const product of activeProducts) {
      if ((selected[product.id] ?? 0) > 0 && !isValidEAN13(product.barcode)) {
        await upsert({ ...product, barcode: generateInternalEAN13(product.id) });
      }
    }
    window.print();
  };

  const presetConfig = labelPresets[preset];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold">Barcode labels</h2>
            <p className="text-sm text-zinc-400">Genereer interne EAN-13 codes en print prijslabels per product.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void generateMissing()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-semibold">
              <Wand2 size={16} /> Genereer ontbrekende codes
            </button>
            <button onClick={() => void printLabels()} disabled={labels.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 font-semibold">
              <Printer size={16} /> Print {labels.length} labels
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="p-3 bg-zinc-950 border-b border-zinc-800">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Zoek product, SKU of barcode..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="max-h-[520px] overflow-auto">
              {filtered.map((product) => {
                const barcode = getPrintableBarcode(product.barcode, product.id);
                const quantity = selected[product.id] ?? 0;
                return (
                  <div key={product.id} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-base truncate">{product.name}</div>
                      <div className="text-sm text-zinc-500 truncate">{[product.brand, product.variant, product.sku].filter(Boolean).join(' — ') || product.id}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 shrink-0">
                      <Barcode size={14} />
                      <span className="font-mono">{barcode}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, quantity - 1)}
                        className="flex items-center justify-center w-11 h-11 rounded-xl bg-zinc-800 hover:bg-red-600/80 active:scale-95 text-white font-bold text-xl transition-all"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={quantity || ''}
                        onChange={(event) => setQuantity(product.id, Number(event.target.value))}
                        className="w-14 h-11 bg-zinc-950 border border-zinc-700 rounded-xl px-2 text-center text-lg font-bold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(product.id, quantity + 1)}
                        className="flex items-center justify-center w-11 h-11 rounded-xl bg-zinc-800 hover:bg-emerald-600/80 active:scale-95 text-white font-bold text-xl transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3">
            <Field label="Printformaat">
              <select value={preset} onChange={(event) => setPreset(event.target.value as LabelPreset)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                {Object.entries(labelPresets).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Prijs tonen</span>
              <input type="checkbox" checked={includePrice} onChange={(event) => setIncludePrice(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>SKU tonen</span>
              <input type="checkbox" checked={includeSku} onChange={(event) => setIncludeSku(event.target.checked)} />
            </label>
            <div className="rounded-lg bg-zinc-900 p-3 text-sm text-zinc-300">
              Selecteer aantallen per product. Voor bestaande GS1/EAN-codes wordt de code behouden; anders maakt het systeem een interne EAN-13 met prefix 20.
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-white p-4 print:border-0 print:p-0 print:bg-white">
        <div className="mb-3 text-sm text-zinc-500 print:hidden">Preview</div>
        {labels.length === 0 ? (
          <div className="print:hidden text-center text-zinc-500 py-12">Nog geen labels geselecteerd.</div>
        ) : (
          <div className={`grid ${presetConfig.cls} gap-2 print:gap-0 justify-start`}>
            {labels.map(({ product, barcode, key }) => (
              <Label key={key} product={product} barcode={barcode} includePrice={includePrice} includeSku={includeSku} style={presetConfig.style} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const Label: React.FC<{
  product: Product;
  barcode: string;
  includePrice: boolean;
  includeSku: boolean;
  style: React.CSSProperties;
}> = ({ product, barcode, includePrice, includeSku, style }) => (
  <div className="label-print border border-zinc-300 bg-white text-black p-1.5 overflow-hidden flex flex-col justify-between" style={style}>
    <div className="min-w-0">
      <div className="font-bold text-[10px] leading-tight truncate">{product.name}</div>
      <div className="text-[8px] leading-tight truncate text-zinc-700">{[product.brand, product.variant].filter(Boolean).join(' - ')}</div>
    </div>
    <BarcodeSvg value={barcode} height={38} className="w-full" />
    <div className="flex justify-between items-end text-[8px] leading-none">
      <span className="truncate pr-1">{includeSku ? product.sku ?? product.id : ''}</span>
      {includePrice && <span className="font-bold text-[11px] whitespace-nowrap">{formatEUR(product.priceCents)}</span>}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">{label}</span>
    {children}
  </label>
);
