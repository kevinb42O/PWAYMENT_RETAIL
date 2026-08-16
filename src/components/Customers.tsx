import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BatteryCharging,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  Gift,
  History,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Users,
  Unlock,
  X,
} from "lucide-react";
import {
  useCustomers,
  generateId,
  generateGiftCardCode,
} from "../store/useCustomers";
import {
  Customer,
  GiftCard,
  GiftCardEvent,
  TenderMethod,
  Transaction,
} from "../types";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { useMerchantProfile } from "../store/useMerchantProfile";
import {
  convertTransactionToInvoiceData,
  downloadInvoicePdf,
  InvoiceData,
} from "../utils/invoicePdfGenerator";
import { InvoicePreviewModal } from "./InvoicePreviewModal";
import {
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_GIFT_CARD_FILTERS,
  filterAndSortCustomers,
  filterAndSortGiftCards,
  type CustomerListFilters,
  type CustomerSortKey,
  type GiftCardListFilters,
  type GiftCardSortKey,
  type SortDirection,
} from "../utils/customerFilters";
import { Modal } from "./Modal";
import { db } from "../db/db";
import { isGiftCardExpired } from "../utils/giftCards";
import { FEATURE_KEYS, useEntitlements } from "../billing/entitlements";
import { useStore } from "../store/useStore";
const parseCents = (txt: string): number => {
  const parsed = parseDecimalToCents(txt);
  return parsed.ok ? parsed.cents : 0;
};

const optionalCents = (txt: string): number | undefined => {
  if (!txt.trim()) return undefined;
  const parsed = parseDecimalToCents(txt);
  return parsed.ok ? parsed.cents : undefined;
};

const giftCardDirectionLabel = (
  key: GiftCardSortKey,
  direction: SortDirection,
): string => {
  if (key === "code" || key === "customer")
    return direction === "asc" ? "A–Z" : "Z–A";
  if (key === "issuedAt" || key === "expiresAt")
    return direction === "asc" ? "Oud–nieuw" : "Nieuw–oud";
  return direction === "asc" ? "Laag–hoog" : "Hoog–laag";
};

export const Customers: React.FC = () => {
  const canIssueGiftCards = useEntitlements(
    (state) => state.snapshot?.features[FEATURE_KEYS.giftCardsIssue] === true,
  );
  const setMainView = useStore((state) => state.setMainView);
  const {
    customers,
    giftCards,
    hydrate,
    upsertCustomer,
    removeCustomer,
    restoreCustomer,
    addGiftCard,
    rechargeGiftCard,
    deactivateGiftCard,
    activateGiftCard,
  } = useCustomers();

  const [activeTab, setActiveTab] = useState<"customers" | "gift_cards">(
    "customers",
  );
  const [customerFilters, setCustomerFilters] = useState<CustomerListFilters>(
    DEFAULT_CUSTOMER_FILTERS,
  );
  const [giftCardFilters, setGiftCardFilters] = useState<GiftCardListFilters>(
    DEFAULT_GIFT_CARD_FILTERS,
  );
  const [showGiftCardFilters, setShowGiftCardFilters] = useState(false);
  const [giftCardMinBalanceText, setGiftCardMinBalanceText] = useState("");
  const [giftCardMaxBalanceText, setGiftCardMaxBalanceText] = useState("");

  const [editingCustomer, setEditingCustomer] =
    useState<Partial<Customer> | null>(null);
  const [editingGiftCard, setEditingGiftCard] = useState<
    (Partial<GiftCard> & { initialText?: string }) | null
  >(null);
  const [rechargeGC, setRechargeGC] = useState<GiftCard | null>(null);
  const [rechargeAmountText, setRechargeAmountText] = useState("0,00");
  const [giftCardPaymentMethod, setGiftCardPaymentMethod] =
    useState<Exclude<TenderMethod, "Cadeaubon">>("PIN");
  const [rechargePaymentMethod, setRechargePaymentMethod] =
    useState<Exclude<TenderMethod, "Cadeaubon">>("PIN");
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveCustomer, setArchiveCustomer] = useState<Customer | null>(null);
  const [giftStatusAction, setGiftStatusAction] = useState<{
    card: GiftCard;
    action: "activate" | "deactivate";
  } | null>(null);
  const [giftStatusReason, setGiftStatusReason] = useState("");
  const [viewingGiftCardId, setViewingGiftCardId] = useState<string | null>(
    null,
  );
  const [giftCardHistory, setGiftCardHistory] = useState<GiftCardEvent[]>([]);
  const [giftCardTransactions, setGiftCardTransactions] = useState<
    Record<number, Transaction>
  >({});
  const [loadingGiftCardHistory, setLoadingGiftCardHistory] = useState(false);

  const merchantProfile = useMerchantProfile((state) => state.profile);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceData | null>(
    null,
  );
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<
    Transaction[]
  >([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [expandedCustomerTransactionId, setExpandedCustomerTransactionId] =
    useState<number | null>(null);

  const viewingGiftCard = useMemo(
    () =>
      giftCards.find((giftCard) => giftCard.id === viewingGiftCardId) ?? null,
    [giftCards, viewingGiftCardId],
  );

  useEffect(() => {
    if (!viewingGiftCardId) {
      setGiftCardHistory([]);
      setGiftCardTransactions({});
      return;
    }
    let cancelled = false;
    setLoadingGiftCardHistory(true);
    void db.gift_card_events
      .where("giftCardId")
      .equals(viewingGiftCardId)
      .sortBy("timestamp")
      .then(async (events) => {
        const ordered = [...events].reverse();
        const transactionIds = [
          ...new Set(
            ordered
              .map((event) => event.transactionId)
              .filter((id): id is number => id != null),
          ),
        ];
        const transactions =
          transactionIds.length > 0
            ? await db.transactions.bulkGet(transactionIds)
            : [];
        if (cancelled) return;
        setGiftCardHistory(ordered);
        setGiftCardTransactions(
          Object.fromEntries(
            transactions
              .filter(
                (transaction): transaction is Transaction =>
                  transaction != null && transaction.id != null,
              )
              .map((transaction) => [transaction.id!, transaction]),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingGiftCardHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewingGiftCardId]);

  const giftCardHistoryStats = useMemo(() => {
    const redemptions = giftCardHistory.filter(
      (event) => event.type === "redeem",
    );
    return {
      redeemedCents: redemptions.reduce(
        (sum, event) => sum + event.amountCents,
        0,
      ),
      redemptionCount: redemptions.length,
      lastRedeemedAt: redemptions[0]?.timestamp,
    };
  }, [giftCardHistory]);

  useEffect(() => {
    if (viewingCustomer) {
      setExpandedCustomerTransactionId(null);
      setLoadingTransactions(true);
      db.transactions
        .filter(
          (t) => t.customerId === viewingCustomer.id && t.isFinalized === 1,
        )
        .reverse()
        .toArray()
        .then(setCustomerTransactions)
        .finally(() => setLoadingTransactions(false));
    } else {
      setCustomerTransactions([]);
    }
  }, [viewingCustomer]);

  const customerGiftCards = useMemo(() => {
    if (!viewingCustomer) return [];
    return giftCards.filter((gc) => gc.customerId === viewingCustomer.id);
  }, [giftCards, viewingCustomer]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const filteredCustomers = useMemo(
    () => filterAndSortCustomers(customers, giftCards, customerFilters),
    [customers, giftCards, customerFilters],
  );

  const customerStats = useMemo(() => {
    const totalSpent = filteredCustomers.reduce(
      (acc, row) => acc + row.customer.totalSpentCents,
      0,
    );
    const avgSpent =
      filteredCustomers.length > 0 ? totalSpent / filteredCustomers.length : 0;
    return { count: filteredCustomers.length, totalSpent, avgSpent };
  }, [filteredCustomers]);

  const effectiveGiftCardFilters = useMemo<GiftCardListFilters>(
    () => ({
      ...giftCardFilters,
      minBalanceCents: optionalCents(giftCardMinBalanceText),
      maxBalanceCents: optionalCents(giftCardMaxBalanceText),
    }),
    [giftCardFilters, giftCardMinBalanceText, giftCardMaxBalanceText],
  );

  const filteredGiftCards = useMemo(
    () =>
      filterAndSortGiftCards(giftCards, customers, effectiveGiftCardFilters),
    [giftCards, customers, effectiveGiftCardFilters],
  );

  const gcStats = useMemo(() => {
    const active = filteredGiftCards.filter(
      (row) =>
        row.giftCard.isActive &&
        !row.isExpired &&
        row.giftCard.balanceCents > 0,
    );
    const totalBalance = filteredGiftCards.reduce(
      (acc, row) => acc + row.giftCard.balanceCents,
      0,
    );
    return {
      count: filteredGiftCards.length,
      activeCount: active.length,
      totalBalance,
    };
  }, [filteredGiftCards]);

  const changeCustomerSort = (key: CustomerSortKey) => {
    setCustomerFilters((current) => ({
      ...current,
      sortKey: key,
      sortDirection:
        current.sortKey === key
          ? current.sortDirection === "asc"
            ? "desc"
            : "asc"
          : key === "name"
            ? "asc"
            : "desc",
    }));
  };

  const changeGiftCardSort = (key: GiftCardSortKey) => {
    setGiftCardFilters((current) => ({
      ...current,
      sortKey: key,
      sortDirection:
        current.sortKey === key
          ? current.sortDirection === "asc"
            ? "desc"
            : "asc"
          : key === "code" || key === "customer"
            ? "asc"
            : "desc",
    }));
  };

  const resetGiftCardFilters = () => {
    setGiftCardFilters(DEFAULT_GIFT_CARD_FILTERS);
    setGiftCardMinBalanceText("");
    setGiftCardMaxBalanceText("");
  };

  const giftCardActiveChips: Array<{
    key: string;
    label: string;
    clear: () => void;
  }> = [];
  if (giftCardFilters.status !== "all") {
    const labels = {
      active: "Actief",
      empty: "Leeg",
      blocked: "Geblokkeerd",
      expired: "Verlopen",
    } as const;
    giftCardActiveChips.push({
      key: "status",
      label: labels[giftCardFilters.status],
      clear: () =>
        setGiftCardFilters((current) => ({ ...current, status: "all" })),
    });
  }
  if (giftCardFilters.owner !== "all") {
    giftCardActiveChips.push({
      key: "owner",
      label:
        giftCardFilters.owner === "linked"
          ? "Gekoppeld aan klant"
          : "Anonieme bon",
      clear: () =>
        setGiftCardFilters((current) => ({ ...current, owner: "all" })),
    });
  }
  if (giftCardFilters.expiry !== "all") {
    const labels = {
      "next-30": "Vervalt binnen 30 dagen",
      expired: "Verlopen",
      "no-expiry": "Geen vervaldatum",
    } as const;
    giftCardActiveChips.push({
      key: "expiry",
      label: labels[giftCardFilters.expiry],
      clear: () =>
        setGiftCardFilters((current) => ({ ...current, expiry: "all" })),
    });
  }
  if (giftCardMinBalanceText) {
    giftCardActiveChips.push({
      key: "minBalance",
      label: `Min. saldo ${giftCardMinBalanceText}`,
      clear: () => setGiftCardMinBalanceText(""),
    });
  }
  if (giftCardMaxBalanceText) {
    giftCardActiveChips.push({
      key: "maxBalance",
      label: `Max. saldo ${giftCardMaxBalanceText}`,
      clear: () => setGiftCardMaxBalanceText(""),
    });
  }

  const handleSaveCustomer = async () => {
    setFormError(null);
    if (!editingCustomer?.name?.trim()) {
      setFormError("Naam is verplicht.");
      return;
    }
    const email = editingCustomer.email?.trim().toLocaleLowerCase("nl-BE");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Vul een geldig e-mailadres in.");
      return;
    }
    const phone = editingCustomer.phone?.trim();
    if (phone && !/^[+()\d\s./-]{6,30}$/.test(phone)) {
      setFormError("Vul een geldig telefoonnummer in.");
      return;
    }
    const duplicate = customers.find(
      (customer) =>
        customer.id !== editingCustomer.id &&
        ((email &&
          customer.email?.trim().toLocaleLowerCase("nl-BE") === email) ||
          (phone &&
            customer.phone?.replace(/\D/g, "") === phone.replace(/\D/g, ""))),
    );
    if (duplicate) {
      setFormError(`Deze contactgegevens horen al bij ${duplicate.name}.`);
      return;
    }
    const customerToSave: Customer = {
      id: editingCustomer.id || generateId(),
      name: editingCustomer.name,
      email: editingCustomer.email,
      phone: editingCustomer.phone,
      address: editingCustomer.address,
      billingProfile: editingCustomer.billingProfile,
      notes: editingCustomer.notes,
      priceGroup: editingCustomer.priceGroup?.trim() || undefined,
      totalSpentCents: editingCustomer.totalSpentCents || 0,
      visitCount: editingCustomer.visitCount || 0,
      lastVisitAt: editingCustomer.lastVisitAt,
      createdAt: editingCustomer.createdAt || new Date().toISOString(),
      isActive: editingCustomer.isActive ?? true,
    };
    try {
      await upsertCustomer(customerToSave);
      setEditingCustomer(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSaveGiftCard = async () => {
    if (!editingGiftCard) return;
    if (!canIssueGiftCards) {
      setFormError("Nieuwe cadeaubonnen uitgeven vereist Retail Professional.");
      return;
    }
    setFormError(null);
    const initialCents = parseCents(editingGiftCard.initialText || "0,00");
    if (initialCents <= 0) {
      setFormError("Bedrag moet groter zijn dan 0.");
      return;
    }
    const card: GiftCard = {
      id: generateId(),
      code: editingGiftCard.code || generateGiftCardCode(),
      customerId: editingGiftCard.customerId || undefined,
      initialCents,
      balanceCents: initialCents,
      issuedAt: new Date().toISOString(),
      expiresAt: editingGiftCard.expiresAt || undefined,
      isActive: true,
    };
    try {
      await addGiftCard(card, [
        { method: giftCardPaymentMethod, amountCents: initialCents },
      ]);
      setEditingGiftCard(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRechargeGiftCard = async () => {
    if (!rechargeGC) return;
    if (!canIssueGiftCards) {
      setFormError("Cadeaubonnen opladen vereist Retail Professional.");
      return;
    }
    setFormError(null);
    const cents = parseCents(rechargeAmountText);
    if (cents <= 0) {
      setFormError("Bedrag moet groter zijn dan 0.");
      return;
    }
    try {
      await rechargeGiftCard(rechargeGC.id, cents, [
        { method: rechargePaymentMethod, amountCents: cents },
      ]);
      setRechargeGC(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="customers-page app-page-content flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Klantenbeheer</h1>
            <p className="text-sm text-zinc-400">
              Beheer klanten, winkelgeschiedenis en cadeaubonnen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === "customers" ? (
              <button
                onClick={() => {
                  setFormError(null);
                  setEditingCustomer({ isActive: true });
                }}
                className="customer-primary-action flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
              >
                <Plus size={18} /> Nieuwe klant
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!canIssueGiftCards) {
                    setMainView("profile");
                    return;
                  }
                  setFormError(null);
                  setGiftCardPaymentMethod("PIN");
                  setEditingGiftCard({
                    code: generateGiftCardCode(),
                    initialText: "0,00",
                  });
                }}
                className="customer-primary-action flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
              >
                {canIssueGiftCards ? <Plus size={18} /> : <Lock size={18} />}
                {canIssueGiftCards ? "Nieuwe cadeaubon" : "Pro vereist"}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <AdminTab
            icon={<Users size={16} />}
            label="Klanten"
            active={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
          />
          <AdminTab
            icon={<CreditCard size={16} />}
            label="Cadeaubonnen"
            active={activeTab === "gift_cards"}
            onClick={() => setActiveTab("gift_cards")}
          />
        </div>

        {activeTab === "customers" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi
                label={
                  customerFilters.status === "archived"
                    ? "Gearchiveerde klanten"
                    : "Actieve klanten"
                }
                value={String(customerStats.count)}
              />
              <Kpi
                label="Totale omzet van geselecteerde profielen"
                value={formatEUR(customerStats.totalSpent)}
              />
              <Kpi
                label="Gemiddelde omzet per geselecteerd profiel"
                value={formatEUR(customerStats.avgSpent)}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="search"
                  value={customerFilters.query}
                  onChange={(e) =>
                    setCustomerFilters((current) => ({
                      ...current,
                      query: e.target.value,
                    }))
                  }
                  placeholder="Zoek naam, e-mail, telefoon, adres of notitie..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <div
                className="inline-flex shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 p-1"
                aria-label="Klantweergave"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCustomerFilters((current) => ({
                      ...current,
                      status: "active",
                    }))
                  }
                  aria-pressed={customerFilters.status === "active"}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold ${customerFilters.status === "active" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  Actief
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomerFilters((current) => ({
                      ...current,
                      status: "archived",
                    }))
                  }
                  aria-pressed={customerFilters.status === "archived"}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold ${customerFilters.status === "archived" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  Archief
                </button>
              </div>
              <span className="shrink-0 text-xs text-zinc-500">
                {filteredCustomers.length} klanten
              </span>
            </div>

            <p className="text-xs text-zinc-500 sm:hidden">
              Veeg horizontaal om alle klantkolommen en acties te bekijken.
            </p>
            <div
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto"
              tabIndex={0}
              aria-label="Horizontaal scrollbare klantentabel"
            >
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <SortableHeader
                      label="Klant"
                      sortKey="name"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableHeader
                      label="Bezoeken"
                      sortKey="visitCount"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                      align="center"
                    />
                    <SortableHeader
                      label="Totaal besteed"
                      sortKey="totalSpent"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Gem. besteding"
                      sortKey="averageSpend"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Laatste bezoek"
                      sortKey="lastVisit"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableHeader
                      label="Cadeaubonsaldo"
                      sortKey="giftCardBalance"
                      activeKey={customerFilters.sortKey}
                      direction={customerFilters.sortDirection}
                      onSort={changeCustomerSort}
                      align="right"
                    />
                    <th className="text-center px-3 py-2 font-medium">
                      Status
                    </th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-10 text-zinc-500"
                      >
                        Geen klanten gevonden.
                      </td>
                    </tr>
                  )}
                  {filteredCustomers.map(
                    ({
                      customer: c,
                      averageSpendCents,
                      openGiftCardBalanceCents,
                    }) => (
                      <tr
                        key={c.id}
                        onClick={() => setViewingCustomer(c)}
                        className="cursor-pointer border-t border-zinc-800 transition hover:bg-zinc-800/60"
                      >
                        <td className="max-w-[280px] px-3 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewingCustomer(c);
                            }}
                            className="block w-full truncate text-left font-semibold text-white underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          >
                            {c.name}
                          </button>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {c.email || c.phone || "Geen contactgegevens"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.visitCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatEUR(c.totalSpentCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                          {formatEUR(averageSpendCents)}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {c.lastVisitAt
                            ? new Date(c.lastVisitAt).toLocaleDateString(
                                "nl-BE",
                              )
                            : "Nooit"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                          {openGiftCardBalanceCents > 0
                            ? formatEUR(openGiftCardBalanceCents)
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!c.isActive ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-400">
                              Gearchiveerd
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-300">
                              Actief
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingCustomer(c);
                              }}
                              className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white"
                              title="Bewerken"
                              aria-label={`${c.name} bewerken`}
                            >
                              <Pencil size={16} />
                            </button>
                            {!c.isActive ? (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void restoreCustomer(c.id);
                                }}
                                className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                title="Herstellen"
                                aria-label={`${c.name} herstellen`}
                              >
                                <RotateCcw size={16} />
                              </button>
                            ) : (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setArchiveCustomer(c);
                                }}
                                className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white"
                                title="Archiveren"
                                aria-label={`${c.name} archiveren`}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "gift_cards" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi
                label="Bonnen in selectie"
                value={`${gcStats.count} / ${giftCards.length}`}
              />
              <Kpi
                label="Actief in selectie"
                value={String(gcStats.activeCount)}
              />
              <Kpi
                label="Saldo in selectie"
                value={formatEUR(gcStats.totalBalance)}
              />
            </div>

            <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[240px]">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  />
                  <input
                    type="search"
                    value={giftCardFilters.query}
                    onChange={(e) =>
                      setGiftCardFilters((current) => ({
                        ...current,
                        query: e.target.value,
                      }))
                    }
                    placeholder="Zoek op code of klantnaam..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                <select
                  aria-label="Cadeaubonstatus"
                  value={giftCardFilters.status}
                  onChange={(e) =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      status: e.target.value as GiftCardListFilters["status"],
                    }))
                  }
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="all">Alle statussen</option>
                  <option value="active">Actief met saldo</option>
                  <option value="empty">Leeg</option>
                  <option value="blocked">Geblokkeerd</option>
                  <option value="expired">Verlopen</option>
                </select>
                <select
                  aria-label="Cadeaubonnen sorteren"
                  value={giftCardFilters.sortKey}
                  onChange={(e) =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      sortKey: e.target.value as GiftCardSortKey,
                    }))
                  }
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="issuedAt">Uitgiftedatum</option>
                  <option value="balance">Huidig saldo</option>
                  <option value="initial">Startbedrag</option>
                  <option value="expiresAt">Vervaldatum</option>
                  <option value="customer">Klant</option>
                  <option value="code">Code</option>
                </select>
                <DirectionButton
                  direction={giftCardFilters.sortDirection}
                  label={giftCardDirectionLabel(
                    giftCardFilters.sortKey,
                    giftCardFilters.sortDirection,
                  )}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      sortDirection:
                        current.sortDirection === "asc" ? "desc" : "asc",
                    }))
                  }
                />
                <button
                  onClick={() => setShowGiftCardFilters((open) => !open)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${showGiftCardFilters || giftCardActiveChips.length > 0 ? "border-blue-500/50 bg-blue-500/10 text-blue-200" : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"}`}
                >
                  <SlidersHorizontal size={16} /> Filters
                  {giftCardActiveChips.length > 0 && (
                    <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] text-white">
                      {giftCardActiveChips.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={resetGiftCardFilters}
                  disabled={
                    giftCardActiveChips.length === 0 && !giftCardFilters.query
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                >
                  Wissen
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <QuickFilterButton
                  label="Actief"
                  active={giftCardFilters.status === "active"}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      status: current.status === "active" ? "all" : "active",
                    }))
                  }
                />
                <QuickFilterButton
                  label="Vervalt binnen 30 dagen"
                  active={giftCardFilters.expiry === "next-30"}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      expiry: current.expiry === "next-30" ? "all" : "next-30",
                    }))
                  }
                />
                <QuickFilterButton
                  label="Leeg"
                  active={giftCardFilters.status === "empty"}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      status: current.status === "empty" ? "all" : "empty",
                    }))
                  }
                />
                <QuickFilterButton
                  label="Geblokkeerd"
                  active={giftCardFilters.status === "blocked"}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      status: current.status === "blocked" ? "all" : "blocked",
                    }))
                  }
                />
                <QuickFilterButton
                  label="Anoniem"
                  active={giftCardFilters.owner === "anonymous"}
                  onClick={() =>
                    setGiftCardFilters((current) => ({
                      ...current,
                      owner:
                        current.owner === "anonymous" ? "all" : "anonymous",
                    }))
                  }
                />
              </div>

              {showGiftCardFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterField label="Koppeling">
                    <select
                      value={giftCardFilters.owner}
                      onChange={(e) =>
                        setGiftCardFilters((current) => ({
                          ...current,
                          owner: e.target.value as GiftCardListFilters["owner"],
                        }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle bonnen</option>
                      <option value="linked">Gekoppeld aan klant</option>
                      <option value="anonymous">Anoniem</option>
                    </select>
                  </FilterField>
                  <FilterField label="Vervaldatum">
                    <select
                      value={giftCardFilters.expiry}
                      onChange={(e) =>
                        setGiftCardFilters((current) => ({
                          ...current,
                          expiry: e.target
                            .value as GiftCardListFilters["expiry"],
                        }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle vervaldata</option>
                      <option value="next-30">Binnen 30 dagen</option>
                      <option value="expired">Verlopen</option>
                      <option value="no-expiry">Geen vervaldatum</option>
                    </select>
                  </FilterField>
                  <FilterField label="Min. saldo (€)">
                    <input
                      inputMode="decimal"
                      value={giftCardMinBalanceText}
                      onChange={(e) =>
                        setGiftCardMinBalanceText(e.target.value)
                      }
                      placeholder="0,00"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </FilterField>
                  <FilterField label="Max. saldo (€)">
                    <input
                      inputMode="decimal"
                      value={giftCardMaxBalanceText}
                      onChange={(e) =>
                        setGiftCardMaxBalanceText(e.target.value)
                      }
                      placeholder="Geen maximum"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </FilterField>
                </div>
              )}

              {giftCardActiveChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {giftCardActiveChips.map((chip) => (
                    <FilterChip
                      key={chip.key}
                      label={chip.label}
                      onClear={chip.clear}
                    />
                  ))}
                  <span className="ml-auto text-xs text-zinc-500">
                    {filteredGiftCards.length} van {giftCards.length}{" "}
                    cadeaubonnen
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-500 sm:hidden">
              Veeg horizontaal om alle cadeaubonkolommen en acties te bekijken.
            </p>
            <div
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto"
              tabIndex={0}
              aria-label="Horizontaal scrollbare cadeaubontabel"
            >
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <GiftCardSortableHeader
                      label="Code"
                      sortKey="code"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                    />
                    <GiftCardSortableHeader
                      label="Klant"
                      sortKey="customer"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                    />
                    <GiftCardSortableHeader
                      label="Startbedrag"
                      sortKey="initial"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                      align="right"
                    />
                    <GiftCardSortableHeader
                      label="Saldo"
                      sortKey="balance"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                      align="right"
                    />
                    <GiftCardSortableHeader
                      label="Uitgiftedatum"
                      sortKey="issuedAt"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                    />
                    <GiftCardSortableHeader
                      label="Vervaldatum"
                      sortKey="expiresAt"
                      activeKey={giftCardFilters.sortKey}
                      direction={giftCardFilters.sortDirection}
                      onSort={changeGiftCardSort}
                    />
                    <th className="text-center px-3 py-2 font-medium">
                      Status
                    </th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredGiftCards.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-10 text-zinc-500"
                      >
                        Geen cadeaubonnen gevonden voor deze filters.
                      </td>
                    </tr>
                  )}
                  {filteredGiftCards.map(
                    ({ giftCard: gc, customerName, isExpired }) => (
                      <tr
                        key={gc.id}
                        onClick={() => setViewingGiftCardId(gc.id)}
                        className="cursor-pointer border-t border-zinc-800 transition hover:bg-zinc-800/60"
                      >
                        <td className="px-3 py-2 font-mono text-emerald-400">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewingGiftCardId(gc.id);
                            }}
                            className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          >
                            {gc.code}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {gc.customerId
                            ? customerName || "Onbekend"
                            : "Anoniem"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                          {formatEUR(gc.initialCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                          {formatEUR(gc.balanceCents)}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {new Date(gc.issuedAt).toLocaleDateString("nl-BE")}
                        </td>
                        <td
                          className={`px-3 py-2 ${isExpired ? "text-red-300" : "text-zinc-400"}`}
                        >
                          {gc.expiresAt
                            ? new Date(gc.expiresAt).toLocaleDateString("nl-BE")
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!gc.isActive ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-red-900/40 text-red-300">
                              Geblokkeerd
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-900/40 text-amber-300">
                              Verlopen
                            </span>
                          ) : gc.balanceCents === 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-400">
                              Leeg
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-900/40 text-emerald-300">
                              Actief
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setViewingGiftCardId(gc.id);
                              }}
                              className="p-2 rounded-lg hover:bg-zinc-700 text-emerald-300"
                              title="Historiek bekijken"
                              aria-label={`Historiek bekijken van ${gc.code}`}
                            >
                              <History size={16} />
                            </button>
                            <button
                              disabled={!canIssueGiftCards}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!canIssueGiftCards) return;
                                setFormError(null);
                                setRechargePaymentMethod("PIN");
                                setRechargeGC(gc);
                                setRechargeAmountText("0,00");
                              }}
                              className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-35"
                              title={canIssueGiftCards ? "Opwaarderen" : "Opwaarderen vereist Retail Professional"}
                            >
                              <BatteryCharging size={16} />
                            </button>
                            {!gc.isActive ? (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGiftStatusReason("");
                                  setGiftStatusAction({
                                    card: gc,
                                    action: "activate",
                                  });
                                }}
                                className="p-2 rounded-lg hover:bg-zinc-700 text-emerald-400"
                                title="Activeren"
                              >
                                <Power size={16} />
                              </button>
                            ) : (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setGiftStatusReason("");
                                  setGiftStatusAction({
                                    card: gc,
                                    action: "deactivate",
                                  });
                                }}
                                className="p-2 rounded-lg hover:bg-zinc-700 text-red-400"
                                title="Blokkeren"
                              >
                                <PowerOff size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {editingCustomer && (
        <Modal
          open
          onClose={() => setEditingCustomer(null)}
          title={
            editingCustomer.id
              ? `Klant bewerken - ${editingCustomer.name}`
              : "Nieuwe klant"
          }
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Annuleren
              </button>
              <button
                onClick={() => void handleSaveCustomer()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Opslaan
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <Field label="Naam">
              <input
                value={editingCustomer.name || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    name: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email">
                <input
                  type="email"
                  value={editingCustomer.email || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      email: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
                />
              </Field>
              <Field label="Telefoon">
                <input
                  type="tel"
                  value={editingCustomer.phone || ""}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      phone: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
                />
              </Field>
            </div>
            <Field label="Prijsgroep">
              <input
                list="pwayment-price-groups"
                value={editingCustomer.priceGroup || ""}
                onChange={(event) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    priceGroup: event.target.value,
                  })
                }
                placeholder="Bijv. telenet-klant, b2b of medewerker"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
              />
              <datalist id="pwayment-price-groups">
                <option value="telenet-klant" />
                <option value="b2b" />
                <option value="medewerker" />
                <option value="contract" />
              </datalist>
            </Field>
            <Field label="Adres">
              <textarea
                value={editingCustomer.address || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    address: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 h-20"
              />
            </Field>
            <Field label="Notities">
              <textarea
                value={editingCustomer.notes || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    notes: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 h-20"
              />
            </Field>
            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200"
              >
                {formError}
              </p>
            )}
          </div>
        </Modal>
      )}

      {editingGiftCard && (
        <Modal
          open
          onClose={() => setEditingGiftCard(null)}
          title="Nieuwe cadeaubon"
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingGiftCard(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Annuleren
              </button>
              <button
                onClick={() => void handleSaveGiftCard()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Uitgeven
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <Field label="Code">
              <div className="flex gap-2">
                <input
                  value={editingGiftCard.code || ""}
                  onChange={(e) =>
                    setEditingGiftCard({
                      ...editingGiftCard,
                      code: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono uppercase"
                />
                <button
                  onClick={() =>
                    setEditingGiftCard({
                      ...editingGiftCard,
                      code: generateGiftCardCode(),
                    })
                  }
                  className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold whitespace-nowrap"
                >
                  Genereer
                </button>
              </div>
            </Field>
            <Field label="Bedrag (€)">
              <input
                inputMode="decimal"
                value={editingGiftCard.initialText || ""}
                onChange={(e) =>
                  setEditingGiftCard({
                    ...editingGiftCard,
                    initialText: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums"
              />
            </Field>
            <Field label="Ontvangen via">
              <select
                value={giftCardPaymentMethod}
                onChange={(event) =>
                  setGiftCardPaymentMethod(event.target.value as "Cash" | "PIN")
                }
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <option value="PIN">Kaart / PIN</option>
                <option value="Cash">Contant</option>
              </select>
            </Field>
            <Field label="Klant (Optioneel)">
              <select
                value={editingGiftCard.customerId || ""}
                onChange={(e) =>
                  setEditingGiftCard({
                    ...editingGiftCard,
                    customerId: e.target.value || undefined,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
              >
                <option value="">Geen (Anoniem)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200"
              >
                {formError}
              </p>
            )}
          </div>
        </Modal>
      )}

      {rechargeGC && (
        <Modal
          open
          onClose={() => setRechargeGC(null)}
          title={`Opwaarderen - ${rechargeGC.code}`}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRechargeGC(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Annuleren
              </button>
              <button
                onClick={() => void handleRechargeGiftCard()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Opwaarderen
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <p className="text-sm text-zinc-400">
              Huidig saldo:{" "}
              <strong className="text-white">
                {formatEUR(rechargeGC.balanceCents)}
              </strong>
            </p>
            <Field label="Bedrag toevoegen (€)">
              <input
                inputMode="decimal"
                value={rechargeAmountText}
                onChange={(e) => setRechargeAmountText(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums"
              />
            </Field>
            <Field label="Ontvangen via">
              <select
                value={rechargePaymentMethod}
                onChange={(event) =>
                  setRechargePaymentMethod(event.target.value as "Cash" | "PIN")
                }
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <option value="PIN">Kaart / PIN</option>
                <option value="Cash">Contant</option>
              </select>
            </Field>
            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200"
              >
                {formError}
              </p>
            )}
          </div>
        </Modal>
      )}

      {archiveCustomer && (
        <Modal
          open
          onClose={() => setArchiveCustomer(null)}
          title="Klant archiveren"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setArchiveCustomer(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-white"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  void removeCustomer(archiveCustomer.id);
                  setArchiveCustomer(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white"
              >
                Archiveren
              </button>
            </div>
          }
        >
          <p className="text-sm text-zinc-300">
            {archiveCustomer.name} verdwijnt uit de actieve klantenlijst.
            Verkoop- en cadeaubonhistoriek blijven bewaard en het profiel kan
            later worden hersteld.
          </p>
        </Modal>
      )}

      {giftStatusAction && (
        <Modal
          open
          onClose={() => setGiftStatusAction(null)}
          title={
            giftStatusAction.action === "activate"
              ? "Cadeaubon activeren"
              : "Cadeaubon blokkeren"
          }
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setGiftStatusAction(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-white"
              >
                Annuleren
              </button>
              <button
                disabled={giftStatusReason.trim().length < 3}
                onClick={() => {
                  const action = giftStatusAction;
                  const reason = giftStatusReason.trim();
                  void (action.action === "activate"
                    ? activateGiftCard(action.card.id, reason)
                    : deactivateGiftCard(action.card.id, reason));
                  setGiftStatusAction(null);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
              >
                Bevestigen
              </button>
            </div>
          }
        >
          <p className="text-sm text-zinc-300">
            Bon {giftStatusAction.card.code} · saldo{" "}
            {formatEUR(giftStatusAction.card.balanceCents)}
          </p>
          <Field label="Reden (verplicht)">
            <textarea
              autoFocus
              value={giftStatusReason}
              onChange={(event) => setGiftStatusReason(event.target.value)}
              className="mt-3 min-h-24 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-white"
            />
          </Field>
        </Modal>
      )}

      {viewingGiftCard && (
        <Modal
          open
          size="xl"
          onClose={() => setViewingGiftCardId(null)}
          title={`Cadeaubon ${viewingGiftCard.code}`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                Klik op elke cadeaubonrij om dit overzicht direct te openen.
              </p>
              <button
                onClick={() => setViewingGiftCardId(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold"
              >
                Sluiten
              </button>
            </div>
          }
        >
          <div className="space-y-5 text-white">
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-bold tracking-wide text-emerald-300">
                    {viewingGiftCard.code}
                  </span>
                  <GiftCardStatusPill giftCard={viewingGiftCard} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
                  <span>
                    Uitgegeven{" "}
                    {new Date(viewingGiftCard.issuedAt).toLocaleString("nl-BE")}
                  </span>
                  <span>
                    {viewingGiftCard.expiresAt
                      ? `Vervalt ${new Date(viewingGiftCard.expiresAt).toLocaleDateString("nl-BE")}`
                      : "Geen vervaldatum"}
                  </span>
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Eigenaar
                </div>
                {viewingGiftCard.customerId ? (
                  <button
                    onClick={() => {
                      const customer = customers.find(
                        (candidate) =>
                          candidate.id === viewingGiftCard.customerId,
                      );
                      if (customer) {
                        setViewingGiftCardId(null);
                        setViewingCustomer(customer);
                      }
                    }}
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-300 hover:text-blue-200"
                  >
                    {customers.find(
                      (customer) => customer.id === viewingGiftCard.customerId,
                    )?.name ?? "Onbekende klant"}
                    <ChevronRight size={15} />
                  </button>
                ) : (
                  <div className="mt-1 font-semibold text-zinc-300">
                    Anonieme cadeaubon
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <GiftCardHistoryKpi
                label="Huidig saldo"
                value={formatEUR(viewingGiftCard.balanceCents)}
                accent="emerald"
              />
              <GiftCardHistoryKpi
                label="Totaal opgeladen"
                value={formatEUR(viewingGiftCard.initialCents)}
              />
              <GiftCardHistoryKpi
                label="Geregistreerd gebruikt"
                value={formatEUR(giftCardHistoryStats.redeemedCents)}
                accent="rose"
              />
              <GiftCardHistoryKpi
                label="Gebruiksmomenten"
                value={String(giftCardHistoryStats.redemptionCount)}
                detail={
                  giftCardHistoryStats.lastRedeemedAt
                    ? `Laatste: ${new Date(giftCardHistoryStats.lastRedeemedAt).toLocaleDateString("nl-BE")}`
                    : "Nog niet gebruikt"
                }
              />
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">
                    <History size={17} className="text-emerald-300" /> Volledige
                    historiek
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Nieuwste gebeurtenis bovenaan · ieder bedrag toont het saldo
                    erna.
                  </p>
                </div>
                <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                  {giftCardHistory.length} gebeurtenissen
                </span>
              </div>

              {loadingGiftCardHistory ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500 animate-pulse">
                  Historiek laden…
                </div>
              ) : giftCardHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center">
                  <History size={24} className="mx-auto mb-2 text-zinc-600" />
                  <p className="font-medium text-zinc-300">
                    Nog geen journaalgebeurtenissen
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Nieuwe uitgiftes, opwaarderingen, betalingen en
                    statuswijzigingen worden automatisch geregistreerd.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {giftCardHistory.map((event) => (
                    <GiftCardHistoryRow
                      key={event.id}
                      event={event}
                      transaction={
                        event.transactionId
                          ? giftCardTransactions[event.transactionId]
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}

      {viewingCustomer && (
        <Modal
          open
          size="5xl"
          onClose={() => setViewingCustomer(null)}
          title={viewingCustomer.name}
          subtitle={`Klant sinds ${new Date(viewingCustomer.createdAt).toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })}`}
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setViewingCustomer(null)}
                className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Sluiten
              </button>
              <button
                onClick={() => {
                  setEditingCustomer(viewingCustomer);
                  setViewingCustomer(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                <Pencil size={15} />
                Klant bewerken
              </button>
            </div>
          }
        >
          <div className="min-w-0 space-y-6 text-slate-900">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <CustomerMetric
                label="Totaal besteed"
                value={formatEUR(viewingCustomer.totalSpentCents)}
              />
              <CustomerMetric
                label="Aankopen"
                value={String(viewingCustomer.visitCount)}
              />
              <CustomerMetric
                label="Gemiddelde bon"
                value={formatEUR(
                  viewingCustomer.visitCount > 0
                    ? Math.round(
                        viewingCustomer.totalSpentCents /
                          viewingCustomer.visitCount,
                      )
                    : 0,
                )}
              />
              <CustomerMetric
                label="Laatste bezoek"
                value={
                  viewingCustomer.lastVisitAt
                    ? new Date(viewingCustomer.lastVisitAt).toLocaleDateString(
                        "nl-BE",
                      )
                    : "Nog geen bezoek"
                }
              />
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">
                  Contact en profiel
                </h3>
                <div className="mt-4 divide-y divide-slate-100">
                  <CustomerInfoRow
                    icon={<Mail size={15} />}
                    label="E-mail"
                    value={viewingCustomer.email}
                    href={
                      viewingCustomer.email
                        ? `mailto:${viewingCustomer.email}`
                        : undefined
                    }
                  />
                  <CustomerInfoRow
                    icon={<Phone size={15} />}
                    label="Telefoon"
                    value={viewingCustomer.phone}
                    href={
                      viewingCustomer.phone
                        ? `tel:${viewingCustomer.phone}`
                        : undefined
                    }
                  />
                  <CustomerInfoRow
                    icon={<MapPin size={15} />}
                    label="Adres"
                    value={viewingCustomer.address}
                    multiline
                  />
                  <CustomerInfoRow
                    icon={<StickyNote size={15} />}
                    label="Notitie"
                    value={viewingCustomer.notes}
                    multiline
                  />
                  <CustomerInfoRow
                    icon={<CalendarDays size={15} />}
                    label="Klant sinds"
                    value={new Date(
                      viewingCustomer.createdAt,
                    ).toLocaleDateString("nl-BE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  />
                </div>
              </section>

              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Cadeaubonnen
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {customerGiftCards.length} gekoppeld
                    </p>
                  </div>
                  <strong className="text-lg text-slate-950">
                    {formatEUR(
                      customerGiftCards.reduce(
                        (sum, card) => sum + card.balanceCents,
                        0,
                      ),
                    )}
                  </strong>
                </div>
                {customerGiftCards.length === 0 ? (
                  <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    Geen cadeaubonnen gekoppeld.
                  </p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                    {customerGiftCards.map((gc) => (
                      <button
                        key={gc.id}
                        onClick={() => {
                          setViewingCustomer(null);
                          setViewingGiftCardId(gc.id);
                        }}
                        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-bold text-slate-700">
                            {gc.code}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {!gc.isActive
                              ? "Geblokkeerd"
                              : gc.balanceCents === 0
                                ? "Leeg"
                                : "Actief"}
                          </span>
                        </span>
                        <strong className="text-sm text-slate-900">
                          {formatEUR(gc.balanceCents)}
                        </strong>
                        <ChevronRight size={15} className="text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Aankoopgeschiedenis
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Nieuwste aankoop bovenaan
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {customerTransactions.length} transacties
                </span>
              </div>
              {loadingTransactions ? (
                <p className="p-6 text-sm text-slate-500 animate-pulse">
                  Aankopen laden…
                </p>
              ) : customerTransactions.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">
                  Nog geen aankopen geregistreerd.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {customerTransactions.map((tx) => {
                    const invData = convertTransactionToInvoiceData(
                      tx,
                      tx.merchantSnapshot ?? merchantProfile,
                      viewingCustomer,
                    );
                    const transactionKey = tx.id ?? tx.timestamp;
                    const expanded =
                      expandedCustomerTransactionId === transactionKey;
                    return (
                      <div key={transactionKey}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCustomerTransactionId(
                              expanded ? null : transactionKey,
                            )
                          }
                          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_auto_auto]"
                        >
                          <span>
                            <span className="block text-sm font-semibold text-slate-800">
                              {new Date(tx.timestamp).toLocaleDateString(
                                "nl-BE",
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {new Date(tx.timestamp).toLocaleTimeString(
                                "nl-BE",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </span>
                          <span className="hidden min-w-0 sm:block">
                            <span className="block truncate text-sm text-slate-600">
                              {tx.items.reduce(
                                (sum, item) => sum + item.quantity,
                                0,
                              )}{" "}
                              artikelen ·{" "}
                              {tx.paymentMethod === "PIN"
                                ? "Kaart"
                                : tx.paymentMethod}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                              {invData.invoiceNumber}
                            </span>
                          </span>
                          <strong className="text-sm text-slate-950">
                            {formatEUR(tx.totalCents)}
                          </strong>
                          <ChevronRight
                            size={16}
                            className={`hidden text-slate-400 transition-transform sm:block ${expanded ? "rotate-90" : ""}`}
                          />
                        </button>
                        {expanded && (
                          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                            <div className="space-y-2">
                              {tx.items.map((item) => {
                                const modSum = (item.modifiers || []).reduce(
                                  (sum, modifier) => sum + modifier.deltaCents,
                                  0,
                                );
                                const totalItemCents =
                                  (item.product.priceCents + modSum) *
                                  item.quantity;
                                return (
                                  <div
                                    key={item.lineId}
                                    className="flex min-w-0 justify-between gap-4 text-sm"
                                  >
                                    <span className="min-w-0 break-words text-slate-600">
                                      {item.quantity} × {item.product.name}
                                    </span>
                                    <span className="shrink-0 font-semibold text-slate-800">
                                      {formatEUR(totalItemCents)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                              <button
                                type="button"
                                title={invData.type === "receipt" ? "Ticket bekijken" : "Factuur bekijken"}
                                onClick={() => setPreviewInvoice(invData)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                              >
                                <Eye size={14} /> {invData.type === "receipt" ? "Ticket bekijken" : "Factuur bekijken"}
                              </button>
                              <button
                                type="button"
                                title="PDF downloaden"
                                onClick={() =>
                                  downloadInvoicePdf(
                                    invData,
                                    `${invData.invoiceNumber}.pdf`,
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                              >
                                <Download size={13} /> PDF downloaden
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}

      {/* INVOICE PREVIEW MODAL */}
      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />
    </div>
  );
};

const CustomerMetric: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950">
      {value}
    </p>
  </div>
);

const CustomerInfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  href?: string;
  multiline?: boolean;
}> = ({ icon, label, value, href, multiline = false }) => {
  const displayValue = value?.trim() || "Niet ingevuld";
  const valueClass = `min-w-0 text-sm leading-6 ${value ? "text-slate-700" : "text-slate-400"} ${multiline ? "whitespace-pre-wrap" : ""} break-words [overflow-wrap:anywhere]`;
  return (
    <div className="grid min-w-0 grid-cols-[20px_92px_minmax(0,1fr)] gap-2 py-3 first:pt-0 last:pb-0">
      <span className="mt-1 text-slate-400">{icon}</span>
      <span className="pt-0.5 text-xs font-semibold text-slate-500">
        {label}
      </span>
      {href && value ? (
        <a
          href={href}
          className={`${valueClass} hover:text-slate-950 hover:underline`}
        >
          {displayValue}
        </a>
      ) : (
        <span className={valueClass}>{displayValue}</span>
      )}
    </div>
  );
};

const GiftCardStatusPill: React.FC<{ giftCard: GiftCard }> = ({ giftCard }) => {
  const expired = isGiftCardExpired(giftCard);
  const style = !giftCard.isActive
    ? "bg-red-500/15 text-red-300 border-red-500/25"
    : expired
      ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
      : giftCard.balanceCents === 0
        ? "bg-zinc-800 text-zinc-400 border-zinc-700"
        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  const label = !giftCard.isActive
    ? "Geblokkeerd"
    : expired
      ? "Verlopen"
      : giftCard.balanceCents === 0
        ? "Leeg"
        : "Actief";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {label}
    </span>
  );
};

const GiftCardHistoryKpi: React.FC<{
  label: string;
  value: string;
  detail?: string;
  accent?: "emerald" | "rose";
}> = ({ label, value, detail, accent }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {label}
    </div>
    <div
      className={`mt-1 text-xl font-bold tabular-nums ${accent === "emerald" ? "text-emerald-300" : accent === "rose" ? "text-rose-300" : "text-white"}`}
    >
      {value}
    </div>
    {detail && <div className="mt-1 text-[11px] text-zinc-500">{detail}</div>}
  </div>
);

const GiftCardHistoryRow: React.FC<{
  event: GiftCardEvent;
  transaction?: Transaction;
}> = ({ event, transaction }) => {
  const config = {
    issue: {
      label: "Cadeaubon uitgegeven",
      icon: <Gift size={17} />,
      color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
      sign: "+",
    },
    recharge: {
      label: "Opgewaardeerd",
      icon: <BatteryCharging size={17} />,
      color: "text-blue-300 bg-blue-500/10 border-blue-500/20",
      sign: "+",
    },
    redeem: {
      label: "Gebruikt bij aankoop",
      icon: <ShoppingBag size={17} />,
      color: "text-rose-300 bg-rose-500/10 border-rose-500/20",
      sign: "−",
    },
    deactivate: {
      label: "Geblokkeerd",
      icon: <Lock size={17} />,
      color: "text-amber-300 bg-amber-500/10 border-amber-500/20",
      sign: "",
    },
    activate: {
      label: "Geactiveerd",
      icon: <Unlock size={17} />,
      color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
      sign: "",
    },
    "opening-balance": {
      label: "Startpunt historiek",
      icon: <History size={17} />,
      color: "text-amber-300 bg-amber-500/10 border-amber-500/20",
      sign: "",
    },
  }[event.type];
  const hasAmount =
    event.type === "issue" ||
    event.type === "recharge" ||
    event.type === "redeem";

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg border p-2 ${config.color}`}>
          {config.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-semibold text-zinc-100">{config.label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {new Date(event.timestamp).toLocaleString("nl-BE")}
                {event.userName ? ` · door ${event.userName}` : ""}
              </div>
            </div>
            <div className="sm:text-right">
              {hasAmount && (
                <div
                  className={`font-bold tabular-nums ${event.type === "redeem" ? "text-rose-300" : "text-emerald-300"}`}
                >
                  {config.sign}
                  {formatEUR(event.amountCents)}
                </div>
              )}
              <div className="text-xs tabular-nums text-zinc-500">
                Saldo erna: {formatEUR(event.balanceAfterCents)}
              </div>
            </div>
          </div>

          {event.note && (
            <p
              className={`mt-2 text-xs ${event.type === "opening-balance" ? "rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-amber-200" : "text-zinc-400"}`}
            >
              {event.note}
            </p>
          )}

          {transaction && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-blue-300">
                  <Receipt size={14} /> Kassaticket #{transaction.id}
                </span>
                <span className="font-bold tabular-nums text-white">
                  Totaal {formatEUR(transaction.totalCents)}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {transaction.items.slice(0, 4).map((item) => {
                  const modifierCents = (item.modifiers ?? []).reduce(
                    (sum, modifier) => sum + modifier.deltaCents,
                    0,
                  );
                  return (
                    <div
                      key={item.lineId}
                      className="flex justify-between gap-3 text-xs text-zinc-400"
                    >
                      <span className="truncate">
                        {item.quantity}× {item.product.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatEUR(
                          (item.product.priceCents + modifierCents) *
                            item.quantity,
                        )}
                      </span>
                    </div>
                  );
                })}
                {transaction.items.length > 4 && (
                  <div className="text-[11px] text-zinc-600">
                    + {transaction.items.length - 4} extra productregels
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="block">
    <span className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">
      {label}
    </span>
    {children}
  </label>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
      {label}
    </span>
    {children}
  </label>
);

const QuickFilterButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "border-blue-500/60 bg-blue-500/15 text-blue-200"
        : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white"
    }`}
  >
    {label}
  </button>
);

const FilterChip: React.FC<{ label: string; onClear: () => void }> = ({
  label,
  onClear,
}) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 py-1 pl-2.5 pr-1.5 text-xs text-blue-200">
    {label}
    <button
      onClick={onClear}
      className="rounded-full p-0.5 hover:bg-blue-500/20"
      aria-label={`Filter ${label} verwijderen`}
    >
      <X size={12} />
    </button>
  </span>
);

const DirectionButton: React.FC<{
  direction: SortDirection;
  label: string;
  onClick: () => void;
}> = ({ direction, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
    title={`${label} — klik om de richting om te keren`}
    aria-label={`Sorteerrichting: ${label}`}
  >
    {direction === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

interface CustomerSortableHeaderProps {
  label: string;
  sortKey: CustomerSortKey;
  activeKey: CustomerSortKey;
  direction: SortDirection;
  onSort: (key: CustomerSortKey) => void;
  align?: "left" | "center" | "right";
}

const SortableHeader: React.FC<CustomerSortableHeaderProps> = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}) => {
  const active = sortKey === activeKey;
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  return (
    <th
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 ${justify} hover:text-[#0e7490]`}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          )
        ) : (
          <ArrowUpDown size={13} className="opacity-40" />
        )}
      </button>
    </th>
  );
};

interface GiftCardSortableHeaderProps {
  label: string;
  sortKey: GiftCardSortKey;
  activeKey: GiftCardSortKey;
  direction: SortDirection;
  onSort: (key: GiftCardSortKey) => void;
  align?: "left" | "center" | "right";
}

const GiftCardSortableHeader: React.FC<GiftCardSortableHeaderProps> = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}) => {
  const active = sortKey === activeKey;
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  return (
    <th
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 ${justify} hover:text-white`}
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          )
        ) : (
          <ArrowUpDown size={13} className="opacity-40" />
        )}
      </button>
    </th>
  );
};

const AdminTab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
      active
        ? "border border-[#bae6fd] bg-[#f0f9ff] text-[#0e7490]"
        : "text-slate-500 hover:bg-white hover:text-slate-800"
    }`}
  >
    {icon}
    {label}
  </button>
);

const Kpi: React.FC<{
  label: string;
  value: string;
  tone?: "emerald" | "amber";
}> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div
      className={`mt-1 text-xl font-bold tabular-nums ${tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-950"}`}
    >
      {value}
    </div>
  </div>
);
