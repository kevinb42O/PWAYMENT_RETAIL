export type LoadingStageId =
  | "starting"
  | "session"
  | "membership"
  | "store-data"
  | "local-cache"
  | "finishing"
  | "ready"
  | "error";

export type LoadingProgress = {
  id: LoadingStageId;
  progress: number;
  title: string;
  detail: string;
};

export const loadingJourney = [
  { id: "account", label: "Account" },
  { id: "workspace", label: "Winkel" },
  { id: "data", label: "Gegevens" },
  { id: "ready", label: "Gereed" },
] as const;

export const loadingJourneyStep = (stage: LoadingStageId): number => {
  if (stage === "starting" || stage === "session") return 0;
  if (stage === "membership") return 1;
  if (stage === "store-data" || stage === "local-cache") return 2;
  if (stage === "error") return 0;
  return 3;
};

const stages: Record<LoadingStageId, LoadingProgress> = {
  starting: { id: "starting", progress: 8, title: "PWAYMENT wordt gestart", detail: "De beveiligde omgeving wordt voorbereid." },
  session: { id: "session", progress: 20, title: "Account verifiëren", detail: "Je aanmeldgegevens en sessie worden gecontroleerd." },
  membership: { id: "membership", progress: 38, title: "Winkelomgeving ophalen", detail: "We laden je winkel en toegangsrechten." },
  "store-data": { id: "store-data", progress: 62, title: "Winkelgegevens synchroniseren", detail: "Producten, voorraad, klanten en instellingen worden bijgewerkt." },
  "local-cache": { id: "local-cache", progress: 82, title: "Lokale werkruimte voorbereiden", detail: "Je gegevens worden klaargezet voor snel en betrouwbaar gebruik." },
  finishing: { id: "finishing", progress: 94, title: "Omgeving afronden", detail: "De laatste instellingen worden toegepast." },
  ready: { id: "ready", progress: 100, title: "Klaar om te starten", detail: "Je winkelomgeving is gereed." },
  error: { id: "error", progress: 0, title: "Laden onderbroken", detail: "Je winkelomgeving kon niet volledig worden geopend." },
};

let current = stages.starting;
const subscribers = new Set<(progress: LoadingProgress) => void>();

export const reportLoadingProgress = (stage: LoadingStageId): void => {
  current = stages[stage];
  subscribers.forEach((subscriber) => subscriber(current));
};

export const getLoadingProgress = (): LoadingProgress => current;

export const subscribeLoadingProgress = (
  subscriber: (progress: LoadingProgress) => void,
): (() => void) => {
  subscribers.add(subscriber);
  subscriber(current);
  return () => subscribers.delete(subscriber);
};
