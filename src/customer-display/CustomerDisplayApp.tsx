import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
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
  isCustomerDisplayMessage,
  type CustomerDisplayMessage,
  type CustomerDisplaySnapshot,
} from "./protocol";
import {
  customerDisplayChannelName,
  readCustomerDisplaySessionFromLocation,
} from "./localSession";
import "./customer-display.css";

const STALE_AFTER_MS = 10_000;
const HELLO_INTERVAL_MS = 2_000;

type ReceiverStatus = "unpaired" | "connecting" | "live" | "stale";

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

const PaymentMethods = ({
  snapshot,
}: {
  snapshot: CustomerDisplaySnapshot;
}) => {
  if (
    !snapshot.presentation.showPaymentMethods ||
    snapshot.acceptedPaymentMethods.length === 0
  ) {
    return null;
  }
  return (
    <footer className="customer-display-payment-footer">
      <span className="customer-display-payment-label">Hier betaal je met</span>
      <div className="customer-display-payment-methods">
        {snapshot.acceptedPaymentMethods.map((method) => (
          <span key={method} className="customer-display-payment-method">
            {method === "gift-card" && <Gift size={17} />}
            {method !== "gift-card" && <CreditCard size={17} />}
            {ACCEPTED_PAYMENT_METHOD_LABELS[method]}
          </span>
        ))}
      </div>
    </footer>
  );
};

const BrandHeader = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  const clock = useClock(snapshot.presentation.showClock);
  return (
    <header className="customer-display-header">
      <div className="customer-display-brand">
        {snapshot.merchant.logoUrl && (
          <img src={snapshot.merchant.logoUrl} alt="" aria-hidden="true" />
        )}
        <span>{snapshot.merchant.displayName}</span>
      </div>
      {snapshot.presentation.showClock && (
        <time className="customer-display-clock">
          <Clock3 size={19} /> {clock}
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
      {snapshot.presentation.idleMessage && (
        <p>{snapshot.presentation.idleMessage}</p>
      )}
    </div>
    <div className="customer-display-idle-card" aria-hidden="true">
      <div className="customer-display-idle-mark">
        <ShoppingBag size={38} />
      </div>
      <span>Persoonlijke service</span>
      <strong>Helder afrekenen</strong>
    </div>
  </main>
);

const CartView = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => {
  const paymentOverlay =
    snapshot.phase === "payment-pending" ||
    snapshot.phase === "payment-failed";
  return (
    <main className="customer-display-cart-layout" aria-live="polite">
      <section className="customer-display-lines-panel">
        <div className="customer-display-section-heading">
          <div>
            <span>Uw aankoop</span>
            <h1>
              {snapshot.lines.reduce((sum, line) => sum + line.quantity, 0)}{" "}
              {snapshot.lines.reduce((sum, line) => sum + line.quantity, 0) === 1
                ? "artikel"
                : "artikelen"}
            </h1>
          </div>
          <ShoppingBag size={27} />
        </div>
        <div className="customer-display-lines">
          {snapshot.lines.map((line, index) => (
            <article
              key={line.lineId}
              className={`customer-display-line${
                index === snapshot.lines.length - 1 ? " is-latest" : ""
              }`}
            >
              <div className="customer-display-line-quantity">
                {line.quantity}×
              </div>
              <div className="customer-display-line-copy">
                <h2>{line.name}</h2>
                {(line.variant || line.modifierLabels.length > 0) && (
                  <p>
                    {[line.variant, ...line.modifierLabels]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
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
          ))}
        </div>
      </section>

      <aside className="customer-display-total-panel">
        <span className="customer-display-total-eyebrow">Overzicht</span>
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
          {snapshot.presentation.showVatBreakdown && (
            <>
              {snapshot.totals.vat12Cents > 0 && (
                <div className="is-detail">
                  <dt>Waarvan btw 12%</dt>
                  <dd>{formatEUR(snapshot.totals.vat12Cents)}</dd>
                </div>
              )}
              {snapshot.totals.vat21Cents > 0 && (
                <div className="is-detail">
                  <dt>Waarvan btw 21%</dt>
                  <dd>{formatEUR(snapshot.totals.vat21Cents)}</dd>
                </div>
              )}
            </>
          )}
        </dl>
        <div className="customer-display-grand-total">
          <span>
            {snapshot.totals.giftCardCents > 0 ? "Nog te betalen" : "Totaal"}
          </span>
          <strong>{formatEUR(snapshot.totals.remainingCents)}</strong>
          <small>Inclusief btw</small>
        </div>

        {paymentOverlay && (
          <div
            className={`customer-display-payment-overlay ${
              snapshot.phase === "payment-failed" ? "is-failed" : ""
            }`}
          >
            {snapshot.phase === "payment-failed" ? (
              <>
                <WifiOff size={30} />
                <strong>Betaling niet gelukt</strong>
                <span>Probeer opnieuw of kies een andere betaalwijze.</span>
              </>
            ) : (
              <>
                <RefreshCw size={30} className="customer-display-spin" />
                <strong>Betaling wordt verwerkt</strong>
                <span>
                  {snapshot.payment?.messageCode === "follow-terminal"
                    ? "Volg de instructies op de betaalterminal."
                    : "Een ogenblik geduld."}
                </span>
              </>
            )}
          </div>
        )}
      </aside>
    </main>
  );
};

const SuccessView = ({ snapshot }: { snapshot: CustomerDisplaySnapshot }) => (
  <main className="customer-display-success" aria-live="assertive">
    <div className="customer-display-success-icon">
      <Check size={62} strokeWidth={2.6} />
    </div>
    <span className="customer-display-eyebrow">Betaling gelukt</span>
    <h1>Bedankt voor je aankoop</h1>
    <div className="customer-display-paid-total">
      <span>Betaald</span>
      <strong>{formatEUR(snapshot.totals.totalCents)}</strong>
    </div>
    {snapshot.payment?.tenderedCents != null && (
      <div className="customer-display-cash-summary">
        <span>
          Ontvangen <strong>{formatEUR(snapshot.payment.tenderedCents)}</strong>
        </span>
        <span>
          Wisselgeld{" "}
          <strong>{formatEUR(snapshot.payment.changeCents ?? 0)}</strong>
        </span>
      </div>
    )}
    <p>Graag tot een volgende keer.</p>
  </main>
);

const ConnectionScreen = ({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className="customer-display-connection-screen">
    <div className="customer-display-connection-icon">{icon}</div>
    <h1>{title}</h1>
    <p>{body}</p>
    <img src="/branding/pwayment-logo.svg" alt="PWAYMENT" />
  </div>
);

export default function CustomerDisplayApp() {
  const sessionId = useMemo(readCustomerDisplaySessionFromLocation, []);
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null);
  const [status, setStatus] = useState<ReceiverStatus>(
    sessionId ? "connecting" : "unpaired",
  );
  const [isFullscreen, setIsFullscreen] = useState(
    () => Boolean(document.fullscreenElement),
  );
  const lastMessageAtRef = useRef(0);
  const snapshotRef = useRef<CustomerDisplaySnapshot | null>(null);
  const statusRef = useRef<ReceiverStatus>(status);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!sessionId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(customerDisplayChannelName(sessionId));

    const sendHello = () => {
      const current = snapshotRef.current;
      const message: CustomerDisplayMessage = current
        ? {
            type: "STATE_REQUEST",
            displaySessionId: sessionId,
            lastRevision: current.revision,
          }
        : { type: "HELLO", displaySessionId: sessionId };
      channel.postMessage(message);
    };

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isCustomerDisplayMessage(event.data)) return;
      const message = event.data;
      if (message.type === "SNAPSHOT") {
        const parsed = customerDisplaySnapshotSchema.safeParse(message.snapshot);
        if (
          !parsed.success ||
          parsed.data.displaySessionId !== sessionId
        ) {
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
        lastMessageAtRef.current = Date.now();
        setSnapshot(parsed.data);
        setStatus("live");
        const ack: CustomerDisplayMessage = {
          type: "ACK",
          displaySessionId: sessionId,
          epochId: parsed.data.epochId,
          revision: parsed.data.revision,
          renderedAt: Date.now(),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
        channel.postMessage(ack);
      } else if (message.type === "HEARTBEAT") {
        lastMessageAtRef.current = Date.now();
        const current = snapshotRef.current;
        if (current) {
          const ack: CustomerDisplayMessage = {
            type: "ACK",
            displaySessionId: sessionId,
            epochId: current.epochId,
            revision: current.revision,
            renderedAt: Date.now(),
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
            },
          };
          channel.postMessage(ack);
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
      if (
        lastMessageAtRef.current > 0 &&
        Date.now() - lastMessageAtRef.current > STALE_AFTER_MS
      ) {
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
  }, [sessionId]);

  if (!sessionId) {
    return (
      <ConnectionScreen
        icon={<MonitorOff size={42} />}
        title="Nog niet gekoppeld"
        body="Start dit klantenscherm vanuit PWAYMENT via Profiel → Hardware → Klantenscherm."
      />
    );
  }

  if (!snapshot || status === "connecting" || status === "stale") {
    return (
      <ConnectionScreen
        icon={
          status === "stale" ? (
            <WifiOff size={42} />
          ) : (
            <RefreshCw size={42} className="customer-display-spin" />
          )
        }
        title={
          status === "stale"
            ? "Verbinding herstellen"
            : "Klantenscherm wordt gestart"
        }
        body="De kassa blijft beschikbaar. Dit scherm herstelt automatisch zodra de verbinding terug is."
      />
    );
  }

  if (snapshot.phase === "disabled") {
    return (
      <ConnectionScreen
        icon={<MonitorOff size={42} />}
        title="Klantenscherm uitgeschakeld"
        body="De eigenaar kan deze optionele module activeren in de Hardware-instellingen."
      />
    );
  }

  return (
    <div
      className="customer-display-shell"
      style={{
        "--customer-display-accent": snapshot.presentation.accentColor,
      } as React.CSSProperties}
    >
      <BrandHeader snapshot={snapshot} />
      {snapshot.phase === "idle" && <IdleView snapshot={snapshot} />}
      {[
        "cart",
        "payment-pending",
        "payment-failed",
      ].includes(snapshot.phase) && <CartView snapshot={snapshot} />}
      {snapshot.phase === "payment-succeeded" && (
        <SuccessView snapshot={snapshot} />
      )}
      <PaymentMethods snapshot={snapshot} />
      {!isFullscreen && (
        <button
          type="button"
          className="customer-display-fullscreen"
          onClick={() => void document.documentElement.requestFullscreen?.()}
        >
          <Expand size={18} /> Volledig scherm
        </button>
      )}
    </div>
  );
}
