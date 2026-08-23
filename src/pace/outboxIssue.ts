import { db } from "../db/db";
import type { OutboxEntry } from "../types";

export interface HumanizedOutboxIssue {
  summary: string;
  resolution: string;
}

const includes = (message: string, pattern: RegExp) => pattern.test(message);

/**
 * Translate durable delivery errors into safe operator copy. Raw backend
 * messages remain available in the recovery queue, but Pace never makes a
 * cashier interpret RPC names, error codes or English infrastructure text.
 */
export const humanizeOutboxIssue = (entry: OutboxEntry): HumanizedOutboxIssue => {
  const message = entry.lastError ?? "";
  const simulatorReference = entry.kind === "transaction"
    ? (entry.payload as { paymentProviderReference?: unknown }).paymentProviderReference
    : undefined;

  if (typeof simulatorReference === "string" && /^sim_[a-f0-9]{32}$/i.test(simulatorReference)) {
    return {
      summary: "Dit is een lokale betaalterminalsimulatie; er is geen echte Mollie-betaling uitgevoerd.",
      resolution: "Verwijder de simulatietest als ze niet in je lokale verkoopadministratie hoort.",
    };
  }

  if (entry.kind === "webshop_email" || includes(message, /e-?mail.*not configured|mail.*niet geconfigureerd/i)) {
    return {
      summary: "De webshopmail kan niet worden verstuurd omdat er nog geen maildienst is gekoppeld.",
      resolution: "Koppel eerst een mailprovider en probeer deze levering daarna opnieuw.",
    };
  }
  if (includes(message, /product-not-found|product .*not found|product ontbreekt/i)) {
    return {
      summary: "Een product uit deze wijziging bestaat nog niet op de server.",
      resolution: "Synchroniseer of herstel het product eerst en probeer de wijziging daarna opnieuw.",
    };
  }
  if (includes(message, /customer-not-found|customer .*not found|klant ontbreekt/i)) {
    return {
      summary: "De gekoppelde klant bestaat nog niet op de server.",
      resolution: "Synchroniseer of herstel de klant eerst en probeer de wijziging daarna opnieuw.",
    };
  }
  if (includes(message, /refund:original-not-found|original transaction .* not found|oorspronkelijke verkoop .*niet/i)) {
    return {
      summary: "De retour kon haar oorspronkelijke verkoop niet lokaal terugvinden.",
      resolution: "PWAYMENT zoekt de oorspronkelijke verkoop ook op de server; probeer deze retour daarna opnieuw.",
    };
  }
  if (includes(message, /unieke synchronisatiereferentie/i)) {
    return {
      summary: "De lokale verkoop mist haar unieke synchronisatiesleutel.",
      resolution: "Deze verkoop kan niet veilig automatisch worden samengevoegd; laat de lokale boeking controleren.",
    };
  }
  if (includes(message, /geen herstelbare verkoopregels/i)) {
    return {
      summary: "De lokale wachtrijkopie was onvolledig en de oorspronkelijke verkoopregels ontbreken ook.",
      resolution: "Probeer deze verkoop niet opnieuw aan te maken; laat de lokale boeking controleren.",
    };
  }
  if (includes(message, /cannot read properties of undefined.*reading ['"]rest['"]/i)) {
    return {
      summary: "De lokale verkooproute kon de beveiligde serververbinding niet starten.",
      resolution: "Dit is een interne synchronisatiefout, geen internet- of betaalfout. Herlaad PWAYMENT na de software-update; de bewaarde verkoop wordt daarna automatisch afgeleverd.",
    };
  }
  if (includes(message, /insufficient-stock|onvoldoende voorraad|negative stock/i)) {
    return {
      summary: "De server weigert de wijziging omdat de beschikbare voorraad niet volstaat.",
      resolution: "Controleer de voorraad en de betrokken verkoopregels voordat je opnieuw probeert.",
    };
  }
  if (includes(message, /forbidden|not-authorized|not authorized|permission|geen toegang|onvoldoende rechten/i)) {
    return {
      summary: "De server weigert deze wijziging omdat de winkel of gebruiker onvoldoende rechten heeft.",
      resolution: "Controleer de winkeltoegang en rechten voordat je opnieuw probeert.",
    };
  }
  if (includes(message, /duplicate|create-conflict|update-conflict|idempotency-conflict|bestaat al/i)) {
    return {
      summary: "De server ziet al een ander record met dezelfde identiteit.",
      resolution: "Controleer het bestaande product of record en los het conflict op voordat je opnieuw probeert.",
    };
  }
  if (includes(message, /invalid|ongeldig|mist .*referentie|missing .*reference/i)) {
    return {
      summary: "De wijziging mist informatie die de server verplicht nodig heeft.",
      resolution: "Open de herstelwachtrij om te zien welk onderdeel moet worden aangevuld.",
    };
  }
  if (includes(message, /fetch|network|offline|timeout|timed out|failed to connect|connection/i)) {
    return {
      summary: "De server kon tijdens de laatste afleverpoging niet worden bereikt.",
      resolution: "PWAYMENT probeert dit automatisch opnieuw zolang de verbinding actief is.",
    };
  }
  if (includes(message, /not configured|niet geconfigureerd/i)) {
    return {
      summary: "De koppeling die deze wijziging moet verwerken is nog niet volledig ingesteld.",
      resolution: "Vul de ontbrekende koppeling in en probeer de levering daarna opnieuw.",
    };
  }

  return entry.deliveryStatus === "retrying"
    ? {
        summary: "De server heeft de laatste afleverpoging nog niet bevestigd.",
        resolution: "PWAYMENT probeert dit automatisch opnieuw; voer de oorspronkelijke handeling niet nog eens uit.",
      }
    : {
        summary: "De server heeft deze wijziging na meerdere pogingen niet aanvaard.",
        resolution: "Open de herstelwachtrij voor het betrokken onderdeel en de aanbevolen herstelactie.",
      };
};

const issuePriority = (entry: OutboxEntry): number => {
  const status = entry.deliveryStatus === "dead_letter" ? 100 : 0;
  const financial = entry.kind === "transaction" || entry.kind === "gift_card_mutation" ? 20 : 0;
  return status + financial;
};

/** Returns only human-safe copy; payloads and raw backend errors never reach Pace. */
export const getPrimaryPaceOutboxIssue = async (): Promise<HumanizedOutboxIssue | undefined> => {
  const entries = (await db.outbox.toArray())
    .filter((entry) => entry.deliveryStatus === "dead_letter" || entry.deliveryStatus === "retrying")
    .sort((left, right) => {
      const priority = issuePriority(right) - issuePriority(left);
      return priority || (left.id ?? 0) - (right.id ?? 0);
    });
  return entries[0] ? humanizeOutboxIssue(entries[0]) : undefined;
};
