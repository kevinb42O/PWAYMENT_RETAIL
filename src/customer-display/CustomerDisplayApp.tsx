import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CircleAlert,
  Clock3,
  CreditCard,
  Expand,
  Gift,
  MonitorOff,
  RefreshCw,
  ShoppingBag,
  WifiOff,
} from "lucide-react";
import { formatEUR } from "../utils/money";
import {
  ACCEPTED_PAYMENT_METHOD_LABELS,
  customerDisplaySnapshotSchema,
  parseCustomerDisplayMessage,
  type AcceptedPaymentMethodId,
  type CustomerDisplayMessage,
  type CustomerDisplaySnapshot,
} from "./protocol";
import {
  customerDisplayChannelName,
  readCustomerDisplaySessionFromLocation,
} from "./localSession";
import { createAccessibleCustomerDisplayTheme } from "./theme";
import "./customer-display.css";

const STALE_AFTER_MS = 10_000;
const HELLO_INTERVAL_MS = 2_000;
const CHANGE_HIGHLIGHT_MS = 1_500;
const CONTROLS_VISIBLE_MS = 12_000;

type ReceiverStatus =
  | "unpaired"
  | "unsupported"
  | "connecting"
  | "live"
  | "stale"
  | "invalid";

interface CartChange {
  lineId?: string;
  announcement: string;
}

const useClock = (enabled: boolean) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
};

const paymentIcon = (method: AcceptedPaymentMethodId) => {
  if (method === "cash") return <Banknote size={18} aria-hidden="true" />;
  if (method === "gift-card") return <Gift size={18} aria-hidden="true" />;
  return <CreditCard size={18} aria-hidden="true" />;
};

const PaymentMethods = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  if (
    !snapshot.presentation.showPaymentMethods ||
    snapshot.acceptedPaymentMethods.length === 0
  ) {
    return null;
  }
  return (
    <footer className="customer-display-payment-footer">
      <span className="customer-display-payment-label">Je kunt hier betalen met</span>
      <div className="customer-display-payment-methods">
        {snapshot.acceptedPaymentMethods.map((method) => (
          <span key={method} className="customer-display-payment-method">
            {paymentIcon(method)}
            {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
          </span>
        ))}
      </div>
    </footer>
  );
};

const BrandHeader = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  const clock = useClock(snapshot.presentation.showClock);
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  return (
    <header className="customer-display-header">
      <div className="customer-display-brand">
        {snapshot.merchant.logoUrl && !logoUnavailable && (
          <img
            src={snapshot.merchant.logoUrl}
            alt={`${snapshot.merchant.displayName} logo`}
            onError={() => setLogoUnavailable(true)}
          />
        )}
        <span>{snapshot.merchant.displayName}</span>
      </div>
      {snapshot.presentation.showClock && (
        <time className="customer-display-clock">
          <Clock3 size={19} aria-hidden="true" /> {clock}
        </time>
      )}
    </header>
  );
};

const IdleView = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => (
  <main className="customer-display-idle">
    <div className="customer-display-idle-orb customer-display-idle-orb-one" />
    <div className="customer-display-idle-orb customer-display-idle-orb-two" />
    <div className="customer-display-idle-copy">
      <span className="customer-display-eyebrow">Fijn dat je er bent</span>
      <h1>{snapshot.presentation.idleHeadline}</h1>
      {snapshot.presentation.idleMessage && <p>{snapshot.presentation.idleMessage}</p>}
    </div>
    <div className="customer-display-idle-card" aria-hidden="true">
      <div className="customer-display-idle-mark">
        <ShoppingBag size={38} />
      </div>
      <span>Welkom bij</span>
      <strong>{snapshot.merchant.displayName}</strong>
    </div>
  </main>
);

const paymentCopy = (snapshot: CustomerDisplaySnapshot) => {
  if (snapshot.phase === "payment-pending") {
    if (snapshot.payment?.messageCode === "follow-terminal") {
      return {
        title: "Volg de betaalterminal",
        body: "Volg de instructies op de terminal. Neem je kaart pas weg wanneer dat wordt gevraagd.",
        tone: "pending",
      } as const;
    }
    if (snapshot.payment?.method === "cash") {
      return {
        title: "Cashbetaling wordt afgerond",
        body: "De kassier voert het ontvangen bedrag in.",
        tone: "pending",
      } as const;
    }
    return {
      title: "Betaling wordt verwerkt",
      body: "Een ogenblik geduld. Start geen tweede betaling.",
      tone: "pending",
    } as const;
  }

  const code = snapshot.payment?.messageCode;
  if (code === "cancelled") {
    return {
      title: "Betaling geannuleerd",
      body: "Je kunt opnieuw proberen of een andere betaalwijze kiezen.",
      tone: "neutral",
    } as const;
  }
  if (code === "declined") {
    return {
      title: "Betaling geweigerd",
      body: "Probeer opnieuw of kies een andere betaalwijze.",
      tone: "failed",
    } as const;
  }
  return {
    title: "Betaling niet afgerond",
    body: "De kassier controleert de betaling. Start niet zelf opnieuw.",
    tone: "failed",
  } as const;
};

const PaymentStatus = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  if (!["payment-pending", "payment-failed"].includes(snapshot.phase)) return null;
  const copy = paymentCopy(snapshot);
  return (
    <div
      className={`customer-display-payment-status is-${copy.tone}`}
      role={snapshot.phase === "payment-failed" ? "alert" : "status"}
    >
      <div className="customer-display-payment-status-icon">
        {snapshot.phase === "payment-pending" ? (
          <RefreshCw size={25} className="customer-display-spin" aria-hidden="true" />
        ) : (
          <CircleAlert size={25} aria-hidden="true" />
        )}
      </div>
      <div>
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
      </div>
    </div>
  );
};

const CartView = ({
  snapshot,
  changedLineId,
}: {
  snapshot: CustomerDisplaySnapshot;
  changedLineId?: string;
}) => {
  const changedLineRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!changedLineId) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    changedLineRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [changedLineId]);

  const itemCount = snapshot.lines.reduce((sum, line) => sum + line.quantity, 0);
  const rounding = snapshot.totals.roundingAdjustmentCents ?? 0;
  const payableCents = snapshot.totals.remainingCents + rounding;
  return (
    <main className="customer-display-cart-layout">
      <section className="customer-display-lines-panel" aria-labelledby="purchase-heading">
        <div className="customer-display-section-heading">
          <div>
            <span>Je aankoop</span>
            <h1 id="purchase-heading">
              {itemCount} {itemCount === 1 ? "artikel" : "artikelen"}
            </h1>
          </div>
          <ShoppingBag size={27} aria-hidden="true" />
        </div>
        <div className="customer-display-lines">
          {snapshot.lines.map((line) => {
            const changed = line.lineId === changedLineId;
            return (
              <article
                key={line.lineId}
                ref={changed ? changedLineRef : undefined}
                className={`customer-display-line${changed ? " is-changed" : ""}`}
              >
                <div className="customer-display-line-quantity">{line.quantity}×</div>
                <div className="customer-display-line-copy">
                  <h2>{line.name}</h2>
                  {(line.variant || line.modifierLabels.length > 0) && (
                    <p>{[line.variant, ...line.modifierLabels].filter(Boolean).join(" · ")}</p>
                  )}
                  <span>{formatEUR(line.unitPriceCents)} per stuk</span>
                </div>
                <div className="customer-display-line-price">
                  {line.standardUnitPriceCents != null && (
                    <s>{formatEUR(line.standardUnitPriceCents * line.quantity)}</s>
                  )}
                  <strong>{formatEUR(line.lineTotalCents)}</strong>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="customer-display-total-panel" aria-labelledby="summary-heading">
        <span id="summary-heading" className="customer-display-total-eyebrow">
          Overzicht
        </span>
        <dl className="customer-display-totals-list">
          <div>
            <dt>Subtotaal</dt>
            <dd>{formatEUR(snapshot.totals.subtotalCents)}</dd>
          </div>
          {snapshot.totals.discountCents > 0 && (
            <div className="is-saving">
              <dt>Korting</dt>
              <dd>− {formatEUR(snapshot.totals.discountCents)}</dd>
            </div>
          )}
          {snapshot.totals.giftCardCents > 0 && (
            <div className="is-saving">
              <dt>Cadeaubon</dt>
              <dd>− {formatEUR(snapshot.totals.giftCardCents)}</dd>
            </div>
          )}
          {rounding !== 0 && (
            <div className="is-detail">
              <dt>Cashafronding</dt>
              <dd>{rounding > 0 ? "+ " : "− "}{formatEUR(Math.abs(rounding))}</dd>
            </div>
          )}
          {snapshot.presentation.showVatBreakdown &&
            snapshot.totals.vatBreakdown.map((line) => (
              <div key={line.rate} className="is-detail">
                <dt>Waarvan btw {line.rate}%</dt>
                <dd>{formatEUR(line.vatCents)}</dd>
              </div>
            ))}
        </dl>

        <div className="customer-display-grand-total">
          <span>
            {snapshot.totals.giftCardCents > 0 || snapshot.phase !== "cart"
              ? "Nog te betalen"
              : "Totaal"}
          </span>
          <strong key={`payable-${snapshot.revision}`}>{formatEUR(payableCents)}</strong>
          <small>Inclusief btw</small>
        </div>
        <PaymentStatus snapshot={snapshot} />
      </aside>
    </main>
  );
};

const SuccessView = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  const paidCents =
    snapshot.totals.totalCents + (snapshot.totals.roundingAdjustmentCents ?? 0);
  return (
    <main className="customer-display-success" aria-live="assertive">
      <div className="customer-display-success-icon">
        <Check size={62} strokeWidth={2.6} aria-hidden="true" />
      </div>
      <span className="customer-display-eyebrow">Betaling gelukt</span>
      <h1>Bedankt voor je aankoop</h1>
      <div className="customer-display-paid-total">
        <span>Betaald</span>
        <strong key={`paid-${snapshot.revision}`}>{formatEUR(paidCents)}</strong>
      </div>
      {snapshot.payment?.tenderedCents != null && (
        <div className="customer-display-cash-summary">
          <span>Ontvangen <strong>{formatEUR(snapshot.payment.tenderedCents)}</strong></span>
          <span>Wisselgeld <strong>{formatEUR(snapshot.payment.changeCents ?? 0)}</strong></span>
        </div>
      )}
      <p>Graag tot de volgende keer.</p>
    </main>
  );
};

const ConnectionScreen = ({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className="customer-display-connection-screen" role="status">
    <div className="customer-display-connection-icon">{icon}</div>
    <h1>{title}</h1>
    <p>{body}</p>
    <span className="customer-display-powered-by">PWAYMENT klantenscherm</span>
  </div>
);

const detectCartChange = (
  previous: CustomerDisplaySnapshot | null,
  next: CustomerDisplaySnapshot,
): CartChange | null => {
  if (!previous) return null;
  if (previous.cartSessionId !== next.cartSessionId) {
    if (previous.phase === "idle" && next.phase === "cart" && next.lines.length > 0) {
      const first = next.lines[next.lines.length - 1];
      return { lineId: first.lineId, announcement: `${first.name} toegevoegd.` };
    }
    return null;
  }
  const previousById = new Map(previous.lines.map((line) => [line.lineId, line]));
  for (const line of [...next.lines].reverse()) {
    const before = previousById.get(line.lineId);
    if (!before) return { lineId: line.lineId, announcement: `${line.name} toegevoegd.` };
    if (
      before.quantity !== line.quantity ||
      before.unitPriceCents !== line.unitPriceCents ||
      before.lineTotalCents !== line.lineTotalCents ||
      before.variant !== line.variant ||
      before.modifierLabels.join("|") !== line.modifierLabels.join("|")
    ) {
      return {
        lineId: line.lineId,
        announcement: `${line.name} aangepast naar ${line.quantity} ${line.quantity === 1 ? "stuk" : "stuks"}, ${formatEUR(line.lineTotalCents)}.`,
      };
    }
  }
  const removed = previous.lines.find(
    (line) => !next.lines.some((candidate) => candidate.lineId === line.lineId),
  );
  return removed ? { announcement: `${removed.name} verwijderd.` } : null;
};

export default function CustomerDisplayApp() {
  const sessionId = useMemo(readCustomerDisplaySessionFromLocation, []);
  const supportsChannel = typeof BroadcastChannel !== "undefined";
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null);
  const [status, setStatus] = useState<ReceiverStatus>(
    !sessionId ? "unpaired" : supportsChannel ? "connecting" : "unsupported",
  );
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cartChange, setCartChange] = useState<CartChange | null>(null);
  const lastMessageAtRef = useRef(Date.now());
  const snapshotRef = useRef<CustomerDisplaySnapshot | null>(null);
  const statusRef = useRef<ReceiverStatus>(status);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (!cartChange) return;
    const timer = window.setTimeout(() => setCartChange(null), CHANGE_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [cartChange]);
  useEffect(() => {
    if (isFullscreen) return;
    const hideTimer = window.setTimeout(() => setControlsVisible(false), CONTROLS_VISIBLE_MS);
    const reveal = () => setControlsVisible(true);
    window.addEventListener("pointermove", reveal, { once: true });
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener("pointermove", reveal);
    };
  }, [controlsVisible, isFullscreen]);
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!sessionId || !supportsChannel) return;
    const channel = new BroadcastChannel(customerDisplayChannelName(sessionId));
    lastMessageAtRef.current = Date.now();

    const sendHello = () => {
      const current = snapshotRef.current;
      const message: CustomerDisplayMessage = current
        ? { type: "STATE_REQUEST", displaySessionId: sessionId, lastRevision: current.revision }
        : { type: "HELLO", displaySessionId: sessionId };
      channel.postMessage(message);
    };

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const raw = event.data;
      if (raw && typeof raw === "object" && (raw as { type?: unknown }).type === "SNAPSHOT") {
        const parsed = customerDisplaySnapshotSchema.safeParse(
          (raw as { snapshot?: unknown }).snapshot,
        );
        if (!parsed.success || parsed.data.displaySessionId !== sessionId) {
          setSnapshot(null);
          setStatus("invalid");
          return;
        }
        const current = snapshotRef.current;
        if (
          current &&
          current.epochId === parsed.data.epochId &&
          parsed.data.revision < current.revision
        ) {
          return;
        }
        const change = detectCartChange(current, parsed.data);
        if (change) setCartChange(change);
        lastMessageAtRef.current = Date.now();
        setSnapshot(parsed.data);
        setStatus("live");
        const ack: CustomerDisplayMessage = {
          type: "ACK",
          displaySessionId: sessionId,
          epochId: parsed.data.epochId,
          revision: parsed.data.revision,
          renderedAt: Date.now(),
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
        channel.postMessage(ack);
        return;
      }

      const message = parseCustomerDisplayMessage(raw);
      if (!message) return;
      if (message.type === "HEARTBEAT") {
        lastMessageAtRef.current = Date.now();
        const current = snapshotRef.current;
        if (current) {
          channel.postMessage({
            type: "ACK",
            displaySessionId: sessionId,
            epochId: current.epochId,
            revision: current.revision,
            renderedAt: Date.now(),
            viewport: { width: window.innerWidth, height: window.innerHeight },
          } satisfies CustomerDisplayMessage);
        }
      } else if (message.type === "GOODBYE") {
        setStatus("stale");
        setSnapshot(null);
      }
    };

    sendHello();
    const helloTimer = window.setInterval(() => {
      if (statusRef.current !== "live") sendHello();
    }, HELLO_INTERVAL_MS);
    const staleTimer = window.setInterval(() => {
      if (Date.now() - lastMessageAtRef.current > STALE_AFTER_MS) {
        setStatus("stale");
        setSnapshot(null);
        sendHello();
      }
    }, 1_000);

    return () => {
      window.clearInterval(helloTimer);
      window.clearInterval(staleTimer);
      channel.close();
    };
  }, [sessionId, supportsChannel]);

  if (!sessionId) {
    return <ConnectionScreen icon={<MonitorOff size={42} />} title="Nog niet gekoppeld" body="Open dit klantenscherm vanuit PWAYMENT via Instellingen → Hardware → Klantenscherm." />;
  }
  if (status === "unsupported") {
    return <ConnectionScreen icon={<MonitorOff size={42} />} title="Browser niet ondersteund" body="Open het scherm in een actuele versie van Chrome, Edge of Safari." />;
  }
  if (status === "invalid") {
    return <ConnectionScreen icon={<CircleAlert size={42} />} title="We controleren de kassabedragen" body="De ontvangen informatie was niet financieel consistent. Er worden geen bedragen getoond. De kassa blijft beschikbaar." />;
  }
  if (!snapshot || status === "connecting" || status === "stale") {
    return (
      <ConnectionScreen
        icon={status === "stale" ? <WifiOff size={42} /> : <RefreshCw size={42} className="customer-display-spin" />}
        title={status === "stale" ? "Kassa niet gevonden" : "Klantenscherm wordt gestart"}
        body={status === "stale" ? "Controleer of PWAYMENT op de kassa geopend is. Dit scherm probeert automatisch opnieuw te verbinden." : "De verbinding met de kassa wordt veilig opgebouwd."}
      />
    );
  }
  if (snapshot.phase === "disabled") {
    const notEntitled = snapshot.availabilityReason === "not-entitled";
    return (
      <ConnectionScreen
        icon={<MonitorOff size={42} />}
        title={notEntitled ? "Klantenscherm niet beschikbaar" : "Klantenscherm uitgeschakeld"}
        body={notEntitled ? "Deze winkellicentie heeft momenteel geen actief klantenscherm. Neem contact op met de eigenaar." : "De eigenaar kan deze module inschakelen in de Hardware-instellingen."}
      />
    );
  }

  const theme = createAccessibleCustomerDisplayTheme(snapshot.presentation.accentColor);
  return (
    <div
      className="customer-display-shell"
      style={{
        "--customer-display-accent": theme.accent,
        "--customer-display-accent-text": theme.accentText,
        "--customer-display-on-accent": theme.onAccent,
      } as React.CSSProperties}
    >
      <BrandHeader snapshot={snapshot} />
      {snapshot.phase === "idle" && <IdleView snapshot={snapshot} />}
      {["cart", "payment-pending", "payment-failed"].includes(snapshot.phase) && (
        <CartView snapshot={snapshot} changedLineId={cartChange?.lineId} />
      )}
      {snapshot.phase === "payment-succeeded" && <SuccessView snapshot={snapshot} />}
      <PaymentMethods snapshot={snapshot} />
      <div className="customer-display-live-region" aria-live="polite" aria-atomic="true">
        {cartChange?.announcement ?? ""}
      </div>
      {!isFullscreen && controlsVisible && (
        <button
          type="button"
          className="customer-display-fullscreen"
          onClick={() => void document.documentElement.requestFullscreen?.()}
        >
          <Expand size={18} aria-hidden="true" /> Volledig scherm
        </button>
      )}
    </div>
  );
}
