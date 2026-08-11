import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewIntegrationInput, useIntegrations } from './useIntegrations';

const supplier: NewIntegrationInput = {
  name: 'Benelux Boards',
  provider: 'Benelux Distribution',
  category: 'supplier',
  baseUrl: 'https://api.benelux.example/v1',
  authType: 'api-key',
  credential: 'secret-value-7890',
  resources: ['products', 'inventory', 'prices'],
  direction: 'import',
  schedule: 'hourly',
  mappings: [
    { source: 'ean', target: 'barcode', enabled: true },
    { source: 'available', target: 'stockQty', enabled: true },
  ],
};

beforeEach(() => {
  localStorage.clear();
  useIntegrations.setState({ integrations: [], webhooks: [], apiKeys: [], logs: [] });
  vi.useFakeTimers();
});

describe('integration management', () => {
  it('stores a supplier configuration without retaining its readable credential', () => {
    const integrationId = useIntegrations.getState().addIntegration(supplier);
    const integration = useIntegrations.getState().integrations[0];

    expect(integration.id).toBe(integrationId);
    expect(integration.credentialConfigured).toBe(true);
    expect(integration.credentialHint).toBe('•••• 7890');
    expect(JSON.stringify(integration)).not.toContain('secret-value-7890');
    expect(integration.mappings).toHaveLength(2);
  });

  it('validates a secure configured endpoint before allowing a sync', async () => {
    const integrationId = useIntegrations.getState().addIntegration(supplier);
    const testPromise = useIntegrations.getState().testConnection(integrationId);
    await vi.advanceTimersByTimeAsync(550);
    await expect(testPromise).resolves.toBe(true);
    expect(useIntegrations.getState().integrations[0].status).toBe('connected');

    const syncPromise = useIntegrations.getState().runSync(integrationId);
    await vi.advanceTimersByTimeAsync(700);
    await expect(syncPromise).resolves.toBe(true);
    expect(useIntegrations.getState().integrations[0]).toEqual(expect.objectContaining({
      recordsSynced: 72,
    }));
    expect(useIntegrations.getState().logs.some((log) => log.kind === 'sync')).toBe(true);
  });

  it('flags insecure endpoints and records the reason', async () => {
    const integrationId = useIntegrations.getState().addIntegration({
      ...supplier,
      baseUrl: 'http://api.benelux.example/v1',
    });
    const testPromise = useIntegrations.getState().testConnection(integrationId);
    await vi.advanceTimersByTimeAsync(550);

    await expect(testPromise).resolves.toBe(false);
    expect(useIntegrations.getState().integrations[0]).toEqual(expect.objectContaining({
      status: 'attention',
      lastError: expect.stringContaining('https://'),
    }));
  });

  it('tests webhooks and creates revocable, scope-limited API keys', async () => {
    useIntegrations.getState().addWebhook({
      name: 'ERP productie',
      url: 'https://erp.example/webhooks/pwayment',
      events: ['sale.created', 'stock.changed'],
    });
    const webhookId = useIntegrations.getState().webhooks[0].id;
    const webhookPromise = useIntegrations.getState().testWebhook(webhookId);
    await vi.advanceTimersByTimeAsync(450);
    await expect(webhookPromise).resolves.toBe(true);
    expect(useIntegrations.getState().webhooks[0].lastStatus).toBe(200);

    const plainSecret = useIntegrations.getState().createApiKey(
      'Rapportering',
      ['sales:read', 'reports:read'],
    );
    const apiKey = useIntegrations.getState().apiKeys[0];
    expect(plainSecret).toMatch(/^pw_live_/);
    expect(apiKey.prefix).not.toBe(plainSecret);
    expect(JSON.stringify(apiKey)).not.toContain(plainSecret);
    expect(apiKey.scopes).toEqual(['sales:read', 'reports:read']);

    useIntegrations.getState().revokeApiKey(apiKey.id);
    expect(useIntegrations.getState().apiKeys[0].active).toBe(false);
  });
});
