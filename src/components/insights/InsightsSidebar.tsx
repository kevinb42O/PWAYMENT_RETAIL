import { useState, type ComponentType } from "react";
import {
  BarChart3,
  Boxes,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  Database,
  Menu,
  Users,
  X,
} from "lucide-react";

export type InsightsSection =
  | "today"
  | "performance"
  | "inventory"
  | "seasons"
  | "customers"
  | "team"
  | "quality";
export type InsightsPage =
  | "today"
  | "performance-overview"
  | "performance-products"
  | "performance-moments"
  | "performance-discounts"
  | "inventory-overview"
  | "inventory-reorder"
  | "inventory-velocity"
  | "seasons-forecast"
  | "seasons-rhythm"
  | "seasons-categories"
  | "customers-overview"
  | "customers-return"
  | "customers-value"
  | "team-overview"
  | "team-activity"
  | "quality";

interface NavigationItem {
  section: InsightsSection;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  defaultPage: InsightsPage;
  pages?: Array<{ id: InsightsPage; label: string }>;
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Nu",
    items: [
      {
        section: "today",
        label: "Acties vandaag",
        icon: ClipboardCheck,
        defaultPage: "today",
      },
    ],
  },
  {
    label: "Winkel",
    items: [
      {
        section: "performance",
        label: "Prestaties",
        icon: BarChart3,
        defaultPage: "performance-overview",
        pages: [
          { id: "performance-overview", label: "Overzicht" },
          { id: "performance-products", label: "Producten" },
          { id: "performance-moments", label: "Verkoopmomenten" },
          { id: "performance-discounts", label: "Kortingen" },
        ],
      },
      {
        section: "inventory",
        label: "Voorraad",
        icon: Boxes,
        defaultPage: "inventory-overview",
        pages: [
          { id: "inventory-overview", label: "Overzicht" },
          { id: "inventory-reorder", label: "Besteladvies" },
          { id: "inventory-velocity", label: "Verkooptempo" },
        ],
      },
      {
        section: "seasons",
        label: "Seizoenen",
        icon: CalendarRange,
        defaultPage: "seasons-forecast",
        pages: [
          { id: "seasons-forecast", label: "Vooruitblik" },
          { id: "seasons-rhythm", label: "Seizoensritme" },
          { id: "seasons-categories", label: "Categorieën" },
        ],
      },
      {
        section: "customers",
        label: "Klanten",
        icon: Users,
        defaultPage: "customers-overview",
        pages: [
          { id: "customers-overview", label: "Overzicht" },
          { id: "customers-return", label: "Herhaalaankopen" },
          { id: "customers-value", label: "Klantwaarde" },
        ],
      },
    ],
  },
  {
    label: "Organisatie",
    items: [
      {
        section: "team",
        label: "Team",
        icon: Users,
        defaultPage: "team-overview",
        pages: [
          { id: "team-overview", label: "Overzicht" },
          { id: "team-activity", label: "Weekdagen" },
        ],
      },
    ],
  },
];

const allNavigationItems = navigationGroups.flatMap((group) => group.items);

export const defaultPageForSection = (section: InsightsSection): InsightsPage =>
  allNavigationItems.find((item) => item.section === section)?.defaultPage ??
  "today";

export const pageLabel = (page: InsightsPage) => {
  if (page === "quality") return "Datadekking";
  for (const item of allNavigationItems) {
    if (item.defaultPage === page && !item.pages) return item.label;
    const child = item.pages?.find((candidate) => candidate.id === page);
    if (child) return `${item.label} · ${child.label}`;
  }
  return "Inzichten";
};

interface InsightsSidebarProps {
  section: InsightsSection;
  page: InsightsPage;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
  badges: Partial<Record<InsightsSection, string | number>>;
  qualityLabel: string;
}

const NavigationContent = ({
  section,
  page,
  onNavigate,
  badges,
  qualityLabel,
  onSelected,
}: InsightsSidebarProps & { onSelected?: () => void }) => (
  <div className="flex h-full flex-col bg-white">
    <div className="border-b border-slate-200 px-5 py-[18px]">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-600">
        Inzichten
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-700">
        Winkelsturing
      </div>
    </div>
    <nav
      className="flex-1 overflow-y-auto px-3 py-4"
      aria-label="Inzichten navigatie"
    >
      {navigationGroups.map((group) => (
        <div key={group.label} className="mb-5 last:mb-0">
          <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = section === item.section;
              const Icon = item.icon;
              return (
                <div key={item.section}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(item.section, item.defaultPage);
                      if (!item.pages) onSelected?.();
                    }}
                    aria-expanded={item.pages ? active : undefined}
                    className={`insights-nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${active ? "insights-nav-item--active" : ""}`}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {badges[item.section] != null &&
                      String(badges[item.section]) !== "0" && (
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                          {badges[item.section]}
                        </span>
                      )}
                    {item.pages && (
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-slate-400 transition-transform ${active ? "rotate-180" : ""}`}
                      />
                    )}
                  </button>
                  {active && item.pages && (
                    <div className="ml-[19px] mt-1 border-l border-slate-200 pl-3">
                      {item.pages.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => {
                            onNavigate(item.section, child.id);
                            onSelected?.();
                          }}
                          aria-current={page === child.id ? "page" : undefined}
                          className={`insights-subnav-item block w-full rounded-md px-3 py-2 text-left text-[13px] font-medium ${page === child.id ? "insights-subnav-item--active" : ""}`}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
    <div className="border-t border-slate-200 p-3">
      <button
        type="button"
        onClick={() => {
          onNavigate("quality", "quality");
          onSelected?.();
        }}
        className={`insights-nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${section === "quality" ? "insights-nav-item--active" : ""}`}
      >
        <Database size={17} strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Datadekking</span>
          <span className="block text-[11px] text-slate-500">
            {qualityLabel}
          </span>
        </span>
      </button>
    </div>
  </div>
);

export const InsightsSidebar = (props: InsightsSidebarProps) => (
  <aside className="hidden w-[248px] shrink-0 border-r border-slate-200 bg-white lg:block">
    <div className="sticky top-0 h-full max-h-[calc(100vh-64px)]">
      <NavigationContent {...props} />
    </div>
  </aside>
);

export const InsightsMobileNavigation = (props: InsightsSidebarProps) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
      >
        <Menu size={18} className="text-cyan-700" />
        <span className="flex-1 text-sm font-bold text-slate-800">
          {pageLabel(props.page)}
        </span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/20 p-3 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Kies een onderdeel"
        >
          <div className="ml-auto flex h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <strong className="text-slate-900">Inzichten</strong>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluit navigatie"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={17} />
              </button>
            </div>
            <NavigationContent {...props} onSelected={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
