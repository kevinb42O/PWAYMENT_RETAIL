import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Barcode, Building2, Download, PackageSearch, Pencil, Plus, RotateCcw, Search, Tags, Trash2, Upload } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { Product } from '../types';
import { centsToDecimalString, formatEUR, parseDecimalToCents } from '../utils/money';
import { parseProductsCsv, serializeProductsCsv, slugifyId } from '../utils/productCsv';
import { isSupportedVatRate, SUPPORTED_VAT_RATES } from '../utils/vat';
import { FEATURES } from '../config/features';
import { Modal } from './Modal';
import { useCategories } from '../store/useCategories';
import { BELGIAN_RETAIL_VAT_RATE } from '../data/categories';
import { MerchantSettings } from './MerchantSettings';
import { BarcodeLabelPrint } from './BarcodeLabelPrint';
import { generateInternalEAN13 } from '../utils/barcode';

const COLOR_PRESETS: { label: string; cls: string }[] = [
  { label: 'Deck blauw', cls: 'bg-sky-700' },
  { label: 'Hardware zinc', cls: 'bg-zinc-700' },
  { label: 'Wielen groen', cls: 'bg-emerald-700' },
  { label: 'Kleding slate', cls: 'bg-slate-800' },
  { label: 'Schoenen neutral', cls: 'bg-neutral-800' },
  { label: 'Protectie rood', cls: 'bg-red-800' },
  { label: 'Accessoire violet', cls: 'bg-violet-800' },
  { label: 'Tool oranje', cls: 'bg-orange-700' },
  { label: 'Service teal', cls: 'bg-teal-700' },
  { label: 'Licht', cls: 'bg-zinc-200 text-black' },
];

/** Editor inputs are nl-BE (`12,50`); invalid text yields 0 and is caught by validation. */
const parseCents = (txt: string): number => {
  const parsed = parseDecimalToCents(txt);
  return parsed.ok ? parsed.cents : 0;
};

const centsToInput = (cents?: number): string => centsToDecimalString(cents ?? 0).replace('.', ',');

const parseWhole = (txt: string): number | undefined => {
  const trimmed = txt.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
};

const marginPercent = (priceCents: number, costPriceCents?: number): number => {
  if (priceCents <= 0 || costPriceCents == null) return 0;
  return ((priceCents - costPriceCents) / priceCents) * 100;
};

export const ProductAdmin: React.FC = () => {
  const list = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);
  const upsert = useProducts((s) => s.upsert);
  const bulkUpsert = useProducts((s) => s.bulkUpsert);
  const remove = useProducts((s) => s.remove);
  const restore = useProducts((s) => s.restore);

  const categories = useCategories((s) => s.list);
  const hydrateCategories = useCategories((s) => s.hydrate);
  const addCategory = useCategories((s) => s.addCategory);
  const removeCategory = useCategories((s) => s.removeCategory);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [priceText, setPriceText] = useState('0,00');
  const [costText, setCostText] = useState('0,00');
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'labels' | 'receipt'>('catalog');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  useEffect(() => {
    void hydrateCategories();
    void hydrateProducts();
  }, [hydrateProducts, hydrateCategories]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const categoryVatById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categories) m.set(c.id, c.vatRate || BELGIAN_RETAIL_VAT_RATE);
    return m;
  }, [categories]);

  const activeProducts = list.filter((p) => p.isActive !== false);
  const inventoryStats = useMemo(() => {
    const tracked = activeProducts.filter((p) => p.stockQty != null);
    const stockUnits = tracked.reduce((sum, p) => sum + (p.stockQty ?? 0), 0);
    const inventoryCost = tracked.reduce((sum, p) => sum + (p.costPriceCents ?? 0) * (p.stockQty ?? 0), 0);
    const inventoryRetail = tracked.reduce((sum, p) => sum + p.priceCents * (p.stockQty ?? 0), 0);
    const lowStock = tracked.filter((p) => p.minStockQty != null && (p.stockQty ?? 0) <= p.minStockQty).length;
    return { stockUnits, inventoryCost, inventoryRetail, potentialMargin: inventoryRetail - inventoryCost, lowStock };
  }, [activeProducts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filter === 'active' && p.isActive === false) return false;
        if (filter === 'archived' && p.isActive !== false) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (
          term &&
          !p.name.toLowerCase().includes(term) &&
          !p.id.includes(term) &&
          !(p.sku ?? '').toLowerCase().includes(term) &&
          !(p.barcode ?? '').toLowerCase().includes(term) &&
          !(p.brand ?? '').toLowerCase().includes(term)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, filter, categoryFilter, search]);

  const openNew = () => {
    if (categories.length === 0) {
      alert('Voeg eerst minstens 1 categorie toe.');
      return;
    }
    const category = categories[0];
    setEditing({
      id: '',
      name: '',
      category: category.id,
      subCategory: '',
      priceCents: 0,
      costPriceCents: 0,
      vatRate: category.vatRate || BELGIAN_RETAIL_VAT_RATE,
      brand: '',
      supplier: '',
      variant: '',
      sku: '',
      barcode: '',
      stockQty: 0,
      minStockQty: 0,
      color: 'bg-sky-700',
      isActive: true,
    });
    setIsNew(true);
    setPriceText('0,00');
    setCostText('0,00');
  };

  const openEdit = (p: Product) => {
    setEditing({ ...p });
    setIsNew(false);
    setPriceText(centsToInput(p.priceCents));
    setCostText(centsToInput(p.costPriceCents));
  };

  const close = () => {
    setEditing(null);
    setIsNew(false);
  };

  const save = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    const sku = editing.sku?.trim();
    const barcode = editing.barcode?.trim();
    const brand = editing.brand?.trim();
    const supplier = editing.supplier?.trim();
    const variant = editing.variant?.trim();
    const subCategory = editing.subCategory?.trim();

    if (!name) {
      alert('Naam is verplicht.');
      return;
    }
    if (!editing.category) {
      alert('Categorie is verplicht.');
      return;
    }

    const price = parseDecimalToCents(priceText);
    if (!price.ok || price.cents <= 0) {
      alert('Verkoopprijs is ongeldig. Gebruik bv. 12,50 en meer dan EUR 0,00.');
      return;
    }
    const cost = parseDecimalToCents(costText || '0');
    if (!cost.ok) {
      alert('Aankoopprijs is ongeldig. Gebruik bv. 6,25.');
      return;
    }
    const priceCents = price.cents;
    const costPriceCents = cost.cents;

    const vatRate = categoryVatById.get(editing.category);
    if (!isSupportedVatRate(vatRate)) {
      alert(
        `De categorie heeft BTW-tarief ${String(vatRate)}%. Enkel ${SUPPORTED_VAT_RATES.join('% en ')}% zijn ondersteund.`,
      );
      return;
    }

    if (sku && list.some((p) => p.id !== editing.id && p.sku?.toLowerCase() === sku.toLowerCase())) {
      alert('SKU bestaat al. Gebruik een unieke SKU.');
      return;
    }

    if (barcode && list.some((p) => p.id !== editing.id && p.barcode === barcode)) {
      alert('Barcode bestaat al. Gebruik een unieke barcode.');
      return;
    }

    const stockQty = parseWhole(String(editing.stockQty ?? ''));
    const minStockQty = parseWhole(String(editing.minStockQty ?? ''));
    if (stockQty != null && minStockQty != null && minStockQty > stockQty) {
      alert('Minimum voorraad kan niet groter zijn dan de huidige voorraad.');
      return;
    }

    let id = editing.id.trim();
    if (isNew) {
      const base = slugifyId(`${brand || 'item'}-${name}`) || 'product';
      let candidate = base;
      let i = 2;
      while (list.some((p) => p.id === candidate)) candidate = `${base}-${i++}`;
      id = candidate;
    }

    await upsert({
      ...editing,
      id,
      name,
      sku: sku || undefined,
      barcode: barcode || undefined,
      brand: brand || undefined,
      supplier: supplier || undefined,
      variant: variant || undefined,
      subCategory: subCategory || undefined,
      costPriceCents,
      priceCents,
      vatRate,
      stockQty,
      minStockQty,
      isActive: editing.isActive ?? true,
    });
    close();
  };

  const createCategory = async () => {
    const created = await addCategory(newCategoryName);
    if (!created) {
      alert('Categorie kon niet toegevoegd worden (bestaat al of is ongeldig).');
      return;
    }
    setNewCategoryName('');
    if (categoryFilter === 'all') setCategoryFilter(created.id);
  };

  const deleteCategory = async (id: string) => {
    const ok = await removeCategory(id);
    if (!ok) {
      alert('Categorie bevat nog producten. Verplaats of archiveer eerst die producten.');
      return;
    }
    if (categoryFilter === id) setCategoryFilter('all');
  };

  const exportProducts = () => {
    const csv = serializeProductsCsv(list);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pwayment_products_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const importProducts = async (file: File) => {
    if (!FEATURES.csvImport) {
      alert('CSV-import is uitgeschakeld.');
      return;
    }
    const { products, issues } = parseProductsCsv(await file.text(), {
      existing: list,
      categoryVatById,
    });

    // All-or-nothing: one bad row aborts the whole import, nothing is written.
    if (issues.length > 0) {
      const shown = issues.slice(0, 15).map((i) => `Regel ${i.line}: ${i.message}`).join('\n');
      alert(
        `Import geannuleerd — ${issues.length} fout(en) gevonden. Er is niets gewijzigd.\n\n${shown}` +
          (issues.length > 15 ? `\n… en ${issues.length - 15} meer.` : ''),
      );
      return;
    }
    if (products.length === 0) {
      alert('Geen rijen gevonden om te importeren.');
      return;
    }

    try {
      await bulkUpsert(products);
      alert(`${products.length} producten geimporteerd.`);
    } catch (err) {
      alert(`Import mislukt, niets gewijzigd: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const editingMargin = marginPercent(parseCents(priceText), parseCents(costText));
  const currentTab = activeTab;

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">Productbeheer</h1>
            <p className="text-sm text-zinc-400">Skateshop catalogus, aankoopprijs, verkoopprijs, voorraad en Belgische BTW.</p>
          </div>
          {currentTab === 'catalog' && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importProducts(file);
                  e.currentTarget.value = '';
                }}
              />
              <button onClick={exportProducts} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-semibold">
                <Download size={18} /> Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!FEATURES.csvImport}
                title={FEATURES.csvImport ? undefined : 'CSV-import is uitgeschakeld'}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={18} /> Import
              </button>
              <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">
                <Plus size={18} /> Nieuw product
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1 print:hidden">
          <AdminTab icon={<PackageSearch size={16} />} label="Catalogus" active={currentTab === 'catalog'} onClick={() => setActiveTab('catalog')} />
          <AdminTab icon={<Barcode size={16} />} label="Barcodes & labels" active={currentTab === 'labels'} onClick={() => setActiveTab('labels')} />
          <AdminTab icon={<Building2 size={16} />} label="Kassaticket" active={currentTab === 'receipt'} onClick={() => setActiveTab('receipt')} />
        </div>

        {currentTab === 'labels' && <BarcodeLabelPrint />}
        {currentTab === 'receipt' && <MerchantSettings />}

        {currentTab === 'catalog' && (
          <>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Actieve producten" value={String(activeProducts.length)} />
          <Kpi label="Voorraad stuks" value={String(inventoryStats.stockUnits)} />
          <Kpi label="Aankoopwaarde" value={formatEUR(inventoryStats.inventoryCost)} />
          <Kpi label="Verkoopwaarde" value={formatEUR(inventoryStats.inventoryRetail)} />
          <Kpi label="Potentiele marge" value={formatEUR(inventoryStats.potentialMargin)} tone={inventoryStats.lowStock > 0 ? 'amber' : 'emerald'} />
        </div>

        {inventoryStats.lowStock > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <AlertTriangle size={16} /> {inventoryStats.lowStock} producten zitten op of onder minimumvoorraad.
          </div>
        )}

        <div className="flex flex-wrap gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, merk, SKU of barcode..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
            <option value="all">Alle categorieen</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button onClick={() => setShowCategoryManager(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-sm font-semibold">
            <Tags size={16} /> Categorieen
          </button>

          <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
            {(['active', 'archived', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-sm font-medium ${filter === f ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {f === 'active' ? 'Actief' : f === 'archived' ? 'Gearchiveerd' : 'Alles'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-left px-3 py-2 font-medium">Categorie</th>
                <th className="text-left px-3 py-2 font-medium">Subcategorie</th>
                <th className="text-left px-3 py-2 font-medium">SKU</th>
                <th className="text-right px-3 py-2 font-medium">Aankoop</th>
                <th className="text-right px-3 py-2 font-medium">Verkoop</th>
                <th className="text-right px-3 py-2 font-medium">Marge</th>
                <th className="text-center px-3 py-2 font-medium">Voorraad</th>
                <th className="text-center px-3 py-2 font-medium">BTW</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-zinc-500">Geen producten.</td>
                </tr>
              )}
              {filtered.map((p) => {
                const lowStock = p.stockQty != null && p.minStockQty != null && p.stockQty <= p.minStockQty;
                return (
                  <tr key={p.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-3 h-3 rounded ${p.color || 'bg-zinc-700'}`} />
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-[11px] text-zinc-500">{[p.brand, p.variant].filter(Boolean).join(' - ') || p.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{categoryNameById.get(p.category) ?? p.category}</td>
                    <td className="px-3 py-2 text-zinc-400">{p.subCategory ?? '-'}</td>
                    <td className="px-3 py-2 text-zinc-400">{p.sku ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatEUR(p.costPriceCents ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatEUR(p.priceCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{marginPercent(p.priceCents, p.costPriceCents).toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-center ${lowStock ? 'text-amber-300 font-semibold' : ''}`}>{p.stockQty == null ? '-' : p.stockQty}</td>
                    <td className="px-3 py-2 text-center text-zinc-400">{p.vatRate || BELGIAN_RETAIL_VAT_RATE}%</td>
                    <td className="px-3 py-2 text-center">
                      {p.isActive === false ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-400">Gearchiveerd</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-900/40 text-emerald-300">Actief</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" title="Bewerken">
                          <Pencil size={16} />
                        </button>
                        {p.isActive === false ? (
                          <button onClick={() => void restore(p.id)} className="p-2 rounded-lg hover:bg-zinc-800 text-emerald-400" title="Herstellen">
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <button onClick={() => setConfirmDelete(p)} className="p-2 rounded-lg hover:bg-zinc-800 text-red-400" title="Archiveren">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      {showCategoryManager && (
        <Modal
          open
          onClose={() => setShowCategoryManager(false)}
          title="Categorieen beheren"
          footer={<button onClick={() => setShowCategoryManager(false)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">Sluiten</button>}
        >
          <div className="space-y-4 text-white">
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800 last:border-b-0">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-zinc-500">BTW {c.vatRate || BELGIAN_RETAIL_VAT_RATE}%</div>
                  </div>
                  <button onClick={() => void deleteCategory(c.id)} className="p-2 rounded-lg text-red-400 hover:bg-zinc-800" title="Verwijderen">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && <div className="p-4 text-sm text-zinc-500">Nog geen categorieen.</div>}
            </div>
            <div className="flex gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nieuwe retailcategorie..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={() => void createCategory()} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold">
                Toevoegen
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          open
          size="lg"
          onClose={close}
          title={isNew ? 'Nieuw product' : `Product bewerken - ${editing.name}`}
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={close} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Annuleren</button>
              <button onClick={() => void save()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Opslaan</button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <Field label="Naam">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Merk">
                <input value={editing.brand ?? ''} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
              <Field label="Leverancier">
                <input value={editing.supplier ?? ''} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
              <Field label="Variant / maat">
                <input value={editing.variant ?? ''} onChange={(e) => setEditing({ ...editing, variant: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Categorie">
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value, vatRate: categoryVatById.get(e.target.value) ?? BELGIAN_RETAIL_VAT_RATE })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategorie">
                <input value={editing.subCategory ?? ''} onChange={(e) => setEditing({ ...editing, subCategory: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
              <Field label="Aankoopprijs excl. BTW">
                <input inputMode="decimal" value={costText} onChange={(e) => setCostText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Verkoopprijs incl. BTW">
                <input inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
              <Metric label="BTW" value={`${editing.vatRate || BELGIAN_RETAIL_VAT_RATE}%`} />
              <Metric label="Brutomarge" value={`${editingMargin.toFixed(1)}%`} />
              <Metric label="Winst per stuk" value={formatEUR(Math.max(0, parseCents(priceText) - parseCents(costText)))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="SKU">
                <input value={editing.sku ?? ''} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
              <Field label="Barcode">
                <div className="flex gap-2">
                  <input value={editing.barcode ?? ''} onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
                  <button onClick={() => setEditing({ ...editing, barcode: generateInternalEAN13(editing.id || editing.name || crypto.randomUUID()) })} className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold whitespace-nowrap">
                    Genereer
                  </button>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Voorraad">
                <input inputMode="numeric" value={editing.stockQty ?? ''} onChange={(e) => setEditing({ ...editing, stockQty: parseWhole(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
              </Field>
              <Field label="Minimum voorraad">
                <input inputMode="numeric" value={editing.minStockQty ?? ''} onChange={(e) => setEditing({ ...editing, minStockQty: parseWhole(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
              </Field>
            </div>

            <Field label="Tegelkleur">
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button key={c.cls} onClick={() => setEditing({ ...editing, color: c.cls })} className={`h-10 rounded-lg ${c.cls} border-2 ${editing.color === c.cls ? 'border-white' : 'border-transparent'}`} title={c.label} />
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(null)}
          title="Product archiveren"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">Annuleren</button>
              <button
                onClick={async () => {
                  await remove(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 font-semibold flex items-center gap-2"
              >
                <Trash2 size={16} /> Archiveren
              </button>
            </div>
          }
        >
          <p className="text-zinc-300">
            <strong>{confirmDelete.name}</strong> wordt verborgen uit het kassamenu maar blijft in historische transacties bewaard.
          </p>
        </Modal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">{label}</span>
    {children}
  </label>
);

const AdminTab: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
      active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
    }`}
  >
    {icon}
    {label}
  </button>
);

const Kpi: React.FC<{ label: string; value: string; tone?: 'emerald' | 'amber' }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
    <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
    <div className={`mt-1 text-xl font-bold tabular-nums ${tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
  </div>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    <div className="font-bold tabular-nums">{value}</div>
  </div>
);
