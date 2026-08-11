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

const stages: Record<LoadingStageId, LoadingProgress> = {
  starting: { id: "starting", progress: 8, title: "We zetten de deur open", detail: "Even de veilige verbinding klaarzetten…" },
  session: { id: "session", progress: 20, title: "Je sleutel wordt gecontroleerd", detail: "We kijken of je sessie nog netjes op zak zit." },
  membership: { id: "membership", progress: 35, title: "Je winkel wordt gevonden", detail: "We zoeken de juiste kassa, niet de bezemkast." },
  "store-data": { id: "store-data", progress: 56, title: "De winkel wordt gevuld", detail: "Verkopen, voorraad, klanten en instellingen komen eraan." },
  "local-cache": { id: "local-cache", progress: 78, title: "Alles krijgt een plek", detail: "We maken je snelle lokale werkruimte klaar." },
  finishing: { id: "finishing", progress: 91, title: "Laatste details", detail: "Nog even de losse eindjes vastknopen." },
  ready: { id: "ready", progress: 100, title: "Klaar voor verkoop", detail: "Je winkel staat scherp." },
  error: { id: "error", progress: 0, title: "Dat liep even scheef", detail: "We konden je winkel nog niet volledig openen." },
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
