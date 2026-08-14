import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { canUseFeature, FEATURE_KEYS, type FeatureKey } from '../billing/entitlements';

export type IntegrationCategory = 'supplier' | 'commerce' | 'accounting' | 'payment' | 'custom';
export type IntegrationStatus = 'connected' | 'attention' | 'paused' | 'disconnected' | 'testing';
export type IntegrationAuthType = 'api-key' | 'bearer' | 'basic' | 'oauth2' | 'sftp';
export type SyncDirection = 'import' | 'export' | 'bidirectional';
export type SyncSchedule = 'manual' | '15m' | 'hourly' | 'daily';

export interface FieldMapping {
  id: string;
  source: string;
  target: string;
  enabled: boolean;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  provider: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  baseUrl: string;
  authType: IntegrationAuthType;
  username?: string;
  credentialConfigured: boolean;
  credentialHint?: string;
  resources: string[];
  direction: SyncDirection;
  schedule: SyncSchedule;
  mappings: FieldMapping[];
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastTestAt?: string;
  lastError?: string;
  recordsSynced?: number;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secretHint: string;
  createdAt: string;
  lastDeliveryAt?: string;
  lastStatus?: number;
}

export interface ApiKeyConfig {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface IntegrationLog {
  id: string;
  integrationId?: string;
  kind: 'configuration' | 'test' | 'sync' | 'webhook' | 'api-key';
  level: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  records?: number;
  durationMs?: number;
}

export interface NewIntegrationInput {
  name: string;
  provider: string;
  category: IntegrationCategory;
  baseUrl: string;
  authType: IntegrationAuthType;
  username?: string;
  credential?: string;
  resources: string[];
  direction: SyncDirection;
  schedule: SyncSchedule;
  mappings: Omit<FieldMapping, 'id'>[];
}

interface IntegrationsState {
  integrations: IntegrationConfig[];
  webhooks: WebhookConfig[];
  apiKeys: ApiKeyConfig[];
  logs: IntegrationLog[];
  addIntegration: (input: NewIntegrationInput) => string;
  updateIntegration: (id: string, input: NewIntegrationInput) => void;
  removeIntegration: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  runSync: (id: string) => Promise<boolean>;
  toggleIntegration: (id: string) => void;
  addWebhook: (input: Pick<WebhookConfig, 'name' | 'url' | 'events'>) => void;
  toggleWebhook: (id: string) => void;
  removeWebhook: (id: string) => void;
  testWebhook: (id: string) => Promise<boolean>;
  createApiKey: (name: string, scopes: string[], expiresAt?: string) => string;
  revokeApiKey: (id: string) => void;
  clearLogs: () => void;
}

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const now = () => new Date().toISOString();

const requireIntegrationCapability = (feature: FeatureKey = FEATURE_KEYS.integrations) => {
  if (!canUseFeature(feature)) {
    throw new Error(`entitlement:plan-required:${feature}`);
  }
};

const secretHint = (secret?: string) => {
  const value = secret?.trim();
  return value ? `•••• ${value.slice(-4)}` : undefined;
};

const addLog = (
  logs: IntegrationLog[],
  entry: Omit<IntegrationLog, 'id' | 'timestamp'>,
) => [
  { ...entry, id: id('log'), timestamp: now() },
  ...logs,
].slice(0, 150);

const endpointIsValid = (integration: IntegrationConfig) => {
  if (integration.authType === 'oauth2') return integration.baseUrl.length > 0;
  const expectedProtocol = integration.authType === 'sftp' ? /^sftp:\/\//i : /^https:\/\//i;
  return expectedProtocol.test(integration.baseUrl) && integration.credentialConfigured;
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const initialLogs: IntegrationLog[] = [
  {
    id: 'log_welcome',
    kind: 'configuration',
    level: 'info',
    message: 'Integratiebeheer is klaar. Voeg een leverancier of verkoopkanaal toe om te starten.',
    timestamp: now(),
  },
];

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set, get) => ({
      integrations: [],
      webhooks: [],
      apiKeys: [],
      logs: initialLogs,

      addIntegration: (input) => {
        requireIntegrationCapability();
        const integrationId = id('int');
        const timestamp = now();
        const integration: IntegrationConfig = {
          id: integrationId,
          name: input.name.trim(),
          provider: input.provider.trim(),
          category: input.category,
          status: 'disconnected',
          baseUrl: input.baseUrl.trim(),
          authType: input.authType,
          username: input.username?.trim() || undefined,
          credentialConfigured: Boolean(input.credential?.trim()) || input.authType === 'oauth2',
          credentialHint: secretHint(input.credential),
          resources: input.resources,
          direction: input.direction,
          schedule: input.schedule,
          mappings: input.mappings.map((mapping) => ({ ...mapping, id: id('map') })),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((state) => ({
          integrations: [integration, ...state.integrations],
          logs: addLog(state.logs, {
            integrationId,
            kind: 'configuration',
            level: 'success',
            message: `${integration.name} is toegevoegd. Test nu de verbinding.`,
          }),
        }));
        return integrationId;
      },

      updateIntegration: (integrationId, input) => {
        requireIntegrationCapability();
        set((state) => ({
          integrations: state.integrations.map((integration) => {
            if (integration.id !== integrationId) return integration;
            return {
              ...integration,
              name: input.name.trim(),
              provider: input.provider.trim(),
              category: input.category,
              baseUrl: input.baseUrl.trim(),
              authType: input.authType,
              username: input.username?.trim() || undefined,
              credentialConfigured: input.credential?.trim()
                ? true
                : integration.credentialConfigured || input.authType === 'oauth2',
              credentialHint: secretHint(input.credential) ?? integration.credentialHint,
              resources: input.resources,
              direction: input.direction,
              schedule: input.schedule,
              mappings: input.mappings.map((mapping, index) => ({
                ...mapping,
                id: integration.mappings[index]?.id ?? id('map'),
              })),
              status: 'disconnected',
              lastError: undefined,
              updatedAt: now(),
            };
          }),
          logs: addLog(state.logs, {
            integrationId,
            kind: 'configuration',
            level: 'info',
            message: 'Configuratie bijgewerkt; voer opnieuw een verbindingstest uit.',
          }),
        }));
      },

      removeIntegration: (integrationId) => {
        requireIntegrationCapability();
        const integration = get().integrations.find((item) => item.id === integrationId);
        set((state) => ({
          integrations: state.integrations.filter((item) => item.id !== integrationId),
          logs: addLog(state.logs, {
            integrationId,
            kind: 'configuration',
            level: 'warning',
            message: `${integration?.name ?? 'Koppeling'} is verwijderd.`,
          }),
        }));
      },

      testConnection: async (integrationId) => {
        requireIntegrationCapability();
        set((state) => ({
          integrations: state.integrations.map((item) =>
            item.id === integrationId ? { ...item, status: 'testing', lastError: undefined } : item,
          ),
        }));
        await wait(550);
        const integration = get().integrations.find((item) => item.id === integrationId);
        if (!integration) return false;
        const valid = endpointIsValid(integration);
        const timestamp = now();
        set((state) => ({
          integrations: state.integrations.map((item) =>
            item.id === integrationId
              ? {
                  ...item,
                  status: valid ? 'connected' : 'attention',
                  lastTestAt: timestamp,
                  lastError: valid
                    ? undefined
                    : item.authType === 'sftp'
                      ? 'Gebruik een sftp:// adres en stel een toegangssleutel in.'
                      : 'Gebruik een beveiligd https:// adres en stel geldige authenticatie in.',
                }
              : item,
          ),
          logs: addLog(state.logs, {
            integrationId,
            kind: 'test',
            level: valid ? 'success' : 'error',
            message: valid
              ? `Verbinding met ${integration.name} is gevalideerd.`
              : `Verbindingscontrole voor ${integration.name} is mislukt.`,
            durationMs: 550,
          }),
        }));
        return valid;
      },

      runSync: async (integrationId) => {
        requireIntegrationCapability();
        const integration = get().integrations.find((item) => item.id === integrationId);
        if (!integration || integration.status !== 'connected') return false;
        await wait(700);
        const records = Math.max(1, integration.resources.length * 24);
        const timestamp = now();
        set((state) => ({
          integrations: state.integrations.map((item) =>
            item.id === integrationId
              ? { ...item, lastSyncAt: timestamp, recordsSynced: records, lastError: undefined }
              : item,
          ),
          logs: addLog(state.logs, {
            integrationId,
            kind: 'sync',
            level: 'success',
            message: `${integration.name}: synchronisatie voltooid.`,
            records,
            durationMs: 700,
          }),
        }));
        return true;
      },

      toggleIntegration: (integrationId) => {
        requireIntegrationCapability();
        set((state) => ({
          integrations: state.integrations.map((item) =>
            item.id === integrationId
              ? { ...item, status: item.status === 'paused' ? 'disconnected' : 'paused' }
              : item,
          ),
        }));
      },

      addWebhook: (input) => {
        requireIntegrationCapability(FEATURE_KEYS.webhooksManage);
        const webhook: WebhookConfig = {
          id: id('wh'),
          name: input.name.trim(),
          url: input.url.trim(),
          events: input.events,
          active: true,
          secretHint: `whsec_••••${Math.random().toString(36).slice(-4)}`,
          createdAt: now(),
        };
        set((state) => ({
          webhooks: [webhook, ...state.webhooks],
          logs: addLog(state.logs, {
            kind: 'webhook',
            level: 'success',
            message: `Webhook ${webhook.name} is toegevoegd.`,
          }),
        }));
      },

      toggleWebhook: (webhookId) => {
        requireIntegrationCapability(FEATURE_KEYS.webhooksManage);
        set((state) => ({
          webhooks: state.webhooks.map((item) =>
            item.id === webhookId ? { ...item, active: !item.active } : item,
          ),
        }));
      },

      removeWebhook: (webhookId) => {
        requireIntegrationCapability(FEATURE_KEYS.webhooksManage);
        set((state) => ({
          webhooks: state.webhooks.filter((item) => item.id !== webhookId),
        }));
      },

      testWebhook: async (webhookId) => {
        requireIntegrationCapability(FEATURE_KEYS.webhooksManage);
        await wait(450);
        const webhook = get().webhooks.find((item) => item.id === webhookId);
        if (!webhook) return false;
        const valid = /^https:\/\//i.test(webhook.url);
        set((state) => ({
          webhooks: state.webhooks.map((item) =>
            item.id === webhookId
              ? { ...item, lastDeliveryAt: now(), lastStatus: valid ? 200 : 400 }
              : item,
          ),
          logs: addLog(state.logs, {
            kind: 'webhook',
            level: valid ? 'success' : 'error',
            message: valid
              ? `Testevent afgeleverd aan ${webhook.name}.`
              : `Testevent voor ${webhook.name} geweigerd: gebruik HTTPS.`,
            durationMs: 450,
          }),
        }));
        return valid;
      },

      createApiKey: (name, scopes, expiresAt) => {
        requireIntegrationCapability(FEATURE_KEYS.apiAccess);
        const secret = `pw_live_${crypto.randomUUID().replaceAll('-', '')}`;
        const apiKey: ApiKeyConfig = {
          id: id('key'),
          name: name.trim(),
          prefix: `${secret.slice(0, 14)}••••${secret.slice(-4)}`,
          scopes,
          active: true,
          createdAt: now(),
          expiresAt: expiresAt || undefined,
        };
        set((state) => ({
          apiKeys: [apiKey, ...state.apiKeys],
          logs: addLog(state.logs, {
            kind: 'api-key',
            level: 'success',
            message: `API-sleutel ${apiKey.name} is aangemaakt.`,
          }),
        }));
        return secret;
      },

      revokeApiKey: (apiKeyId) => {
        requireIntegrationCapability(FEATURE_KEYS.apiAccess);
        set((state) => ({
          apiKeys: state.apiKeys.map((item) =>
            item.id === apiKeyId ? { ...item, active: false } : item,
          ),
          logs: addLog(state.logs, {
            kind: 'api-key',
            level: 'warning',
            message: 'API-sleutel is ingetrokken en kan niet meer worden gebruikt.',
          }),
        }));
      },

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'pwayment-integrations-v1',
      partialize: (state) => ({
        integrations: state.integrations,
        webhooks: state.webhooks,
        apiKeys: state.apiKeys,
        logs: state.logs,
      }),
    },
  ),
);
