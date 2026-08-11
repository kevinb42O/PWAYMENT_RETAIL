import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { formatEUR } from '../../utils/money';

export type ValueMetric = 'revenue' | 'profit' | 'units' | 'transactions' | 'average';

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[28px] font-bold tracking-tight text-slate-950">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export const PeriodControl = ({ period, onChange }: { period: '7d' | '30d' | '12m'; onChange: (period: '7d' | '30d' | '12m') => void }) => (
  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="Periode">
    {([
      ['7d', '7 dagen'],
      ['30d', '30 dagen'],
      ['12m', '12 maanden'],
    ] as const).map(([id, label]) => (
      <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={period === id} className={`insights-control rounded-md px-3 py-1.5 text-xs font-bold ${period === id ? 'insights-control--active' : ''}`}>{label}</button>
    ))}
  </div>
);

export const SegmentControl = <T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (value: T) => void; label: string }) => (
  <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label={label}>
    {options.map((option) => <button key={option.id} type="button" onClick={() => onChange(option.id)} aria-pressed={value === option.id} className={`insights-control rounded-md px-3 py-1.5 text-xs font-bold ${value === option.id ? 'insights-control--active' : ''}`}>{option.label}</button>)}
  </div>
);

export const MetricCard = ({ label, value, change, detail }: { label: string; value: string; change?: number | null; detail?: string }) => (
  <div className="insights-panel min-w-0 p-4">
    <div className="text-xs font-semibold text-slate-500">{label}</div>
    <div className="mt-2 flex flex-wrap items-baseline gap-2">
      <div className="break-words text-2xl font-bold tracking-tight text-slate-950">{value}</div>
      {change != null && <span className={`inline-flex items-center gap-1 text-xs font-bold ${change >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{change >= 0 ? '+' : ''}{change.toFixed(0)}%</span>}
    </div>
    {detail && <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>}
  </div>
);

export const EmptyChart = ({ label }: { label: string }) => (
  <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
    <div><BarChart3 size={24} className="mx-auto text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-500">{label}</p></div>
  </div>
);

export const HorizontalBars = ({
  rows,
  formatValue = (value) => String(Math.round(value)),
  onSelect,
  emptyLabel = 'Nog geen gegevens in deze periode.',
}: {
  rows: Array<{ key: string; label: string; value: number; secondary?: string; valueLabel?: string }>;
  formatValue?: (value: number) => string;
  onSelect?: (key: string) => void;
  emptyLabel?: string;
}) => {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0 || rows.every((row) => row.value === 0)) return <EmptyChart label={emptyLabel} />;
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const content = <>
          <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold text-slate-700" title={row.label}>{row.label}</span><span className="shrink-0 font-bold text-slate-900">{row.valueLabel ?? formatValue(row.value)}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${Math.max(0, (row.value / max) * 100)}%` }} /></div>
          {row.secondary && <div className="mt-1.5 text-xs text-slate-500">{row.secondary}</div>}
        </>;
        return onSelect ? <button key={row.key} type="button" onClick={() => onSelect(row.key)} className="group block w-full cursor-pointer rounded-lg p-1 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-cyan-600">{content}</button> : <div key={row.key}>{content}</div>;
      })}
    </div>
  );
};

export const VerticalBars = ({ rows, metric, onSelect }: { rows: Array<{ key: string; label: string; revenueCents: number; transactionCount: number; averageSaleCents: number }>; metric: 'revenue' | 'transactions' | 'average'; onSelect?: (key: string) => void }) => {
  const valueFor = (row: typeof rows[number]) => metric === 'revenue' ? row.revenueCents : metric === 'transactions' ? row.transactionCount : row.averageSaleCents;
  const max = Math.max(1, ...rows.map(valueFor));
  const formatValue = (value: number) => metric === 'transactions' ? String(value) : formatEUR(value);
  // Exact currency labels need more room than the bars themselves. A wider
  // scrollable canvas prevents labels from colliding in the 12-column hourly view.
  const minimumChartWidth = Math.max(560, rows.length * 96);
  if (rows.length === 0 || rows.every((row) => valueFor(row) === 0)) return <EmptyChart label="Nog geen verkoopmomenten in deze periode." />;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-end gap-2" style={{ height: 264, minWidth: minimumChartWidth }}>
        {rows.map((row) => {
          const value = valueFor(row);
          const valueLabel = formatValue(value);
          const isMaximum = value === max;
          return (
            <button key={row.key} type="button" onClick={() => onSelect?.(row.key)} aria-label={`${row.label}: ${metric === 'transactions' ? `${value} verkopen` : valueLabel}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" title={`${row.label}: ${valueLabel}`}>
              <span className={`mb-2 whitespace-nowrap text-xs font-bold tabular-nums ${isMaximum ? 'text-slate-950' : 'text-slate-600'}`}>{valueLabel}</span>
              <span className={`mx-auto w-full max-w-12 rounded-t-md transition-colors ${isMaximum ? 'bg-cyan-700' : 'bg-cyan-600 group-hover:bg-cyan-700'}`} style={{ height: `${Math.max(2, (value / max) * 196)}px` }} />
              <span className="mt-2 text-[11px] font-semibold text-slate-500">{row.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const DonutBreakdown = ({
  rows,
  valueFormatter = formatEUR,
  centerLabel = 'Totaal',
  ariaLabel = 'Verdeling',
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  valueFormatter?: (value: number) => string;
  centerLabel?: string;
  ariaLabel?: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const visibleRows = rows.filter((row) => row.value > 0);
  const total = visibleRows.reduce((sum, row) => sum + row.value, 0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (total <= 0) return <EmptyChart label="Nog geen verdeling beschikbaar." />;

  const colors = ['#0e7490', '#06b6d4', '#94a3b8', '#f59e0b'];
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div ref={containerRef} className="flex min-h-[320px] flex-col items-center justify-center gap-7 py-2 sm:flex-row xl:flex-col 2xl:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={ariaLabel}>
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="18" />
          {visibleRows.map((row, index) => {
            const length = (row.value / total) * circumference;
            const segment = (
              <circle
                key={row.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="18"
                strokeDasharray={`${visible ? length : 0} ${circumference}`}
                strokeDashoffset={-offset}
                style={{
                  transition: 'stroke-dasharray 760ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transitionDelay: `${index * 110}ms`,
                }}
              >
                <title>{row.label}: {Math.round((row.value / total) * 100)}% · {valueFormatter(row.value)}</title>
              </circle>
            );
            offset += length;
            return segment;
          })}
        </svg>
        <div className={`absolute inset-0 flex flex-col items-center justify-center text-center px-4 transition duration-500 ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
          <span className="max-w-[100px] text-[10px] sm:text-[11px] font-bold leading-tight uppercase tracking-[0.12em] text-slate-400 [word-break:break-word]">{centerLabel}</span>
          <strong className="mt-1 max-w-[100px] truncate text-xl font-bold tracking-tight text-slate-950">{valueFormatter(total)}</strong>
        </div>
      </div>
      <div className="w-full max-w-sm space-y-3">
        {visibleRows.map((row, index) => (
          <div key={row.key} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 pb-3 transition duration-500 last:border-0 last:pb-0 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`} style={{ transitionDelay: `${180 + index * 80}ms` }}>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-700">{row.label}</div><div className="mt-0.5 text-xs text-slate-500">{valueFormatter(row.value)}</div></div>
            <strong className="text-base text-slate-950">{Math.round((row.value / total) * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SectionCard = ({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) => (
  <section className="insights-panel p-5">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h2 className="text-base font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div>
      {action}
    </div>
    {children}
  </section>
);

export const TextLink = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-bold text-cyan-800 hover:text-cyan-950">{label}<ChevronRight size={14} /></button>;
