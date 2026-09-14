import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_CATALOG } from '../models/catalog.js';
import { REALTIME_MODEL_IDS, REALTIME_MODELS } from '../models/realtime-models.js';
import { createFoundryOpenAI } from '../providers/openai.js';
import { createFoundryRealtime, createFoundryRealtimeSetup } from '../providers/realtime.js';
import { getLiveCapabilityModelMatrix } from './helpers/live-capabilities.js';

const foundryUrl = 'https://example.palantirfoundry.com';
const factory = createFoundryRealtime({ foundryUrl });

describe('Foundry realtime', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each(REALTIME_MODEL_IDS)(
    'routes %s to the realtime API name with bearer authentication',
    (model) => {
      const setup = createFoundryRealtimeSetup({ foundryUrl, model, token: 'user-token' });
      expect(factory(model).getWebSocketConfig(setup)).toEqual({
        url: `${foundryUrl.replace('https:', 'wss:')}/language-model-service/ws/v1/open-ai/realtime?model=${model}`,
        protocols: ['Bearer-user-token'],
      });
      const openai = createFoundryOpenAI({ foundryUrl, token: 'test-token' });
      expect(() => openai(model)).toThrow('Use createFoundryRealtime');
      expect(() => openai.responses(REALTIME_MODELS[model].rid)).toThrow(
        'Use createFoundryRealtime',
      );
      expect(MODEL_CATALOG[model]).toBe(REALTIME_MODELS[model]);
      expect(MODEL_CATALOG[model].supportsResponses).toBe(false);
    },
  );

  it('keeps realtime models out of the HTTP language survey', () => {
    vi.stubEnv('LIVE_MODEL_SCOPE', 'catalog');
    vi.stubEnv('FOUNDRY_URL', foundryUrl);
    vi.stubEnv('FOUNDRY_TOKEN', 'test-token');
    const matrix = getLiveCapabilityModelMatrix();
    for (const id of REALTIME_MODEL_IDS) expect(matrix.openai).not.toContain(id);
  });

  it('does not send credentials to a different host, path, model or protocol', () => {
    for (const url of [
      'wss://attacker.example/language-model-service/ws/v1/open-ai/realtime?model=gpt-realtime',
      `${foundryUrl}/language-model-service/ws/v1/open-ai/realtime?model=gpt-realtime`,
      `${foundryUrl.replace('https:', 'wss:')}/v1/realtime?model=gpt-realtime`,
      `${foundryUrl.replace('https:', 'wss:')}/language-model-service/ws/v1/open-ai/realtime?model=gpt-realtime-2`,
    ])
      expect(() => factory('gpt-realtime').getWebSocketConfig({ token: 'secret', url })).toThrow(
        'does not match',
      );
  });

  it('rejects invalid origins, tokens and non-realtime models without network requests', () => {
    for (const foundryUrl of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/?q=1',
    ]) {
      expect(() => createFoundryRealtime({ foundryUrl })).toThrow();
    }
    for (const token of ['', 'token with spaces', 'secret\nheader']) {
      expect(() =>
        createFoundryRealtimeSetup({ foundryUrl, model: 'gpt-realtime', token }),
      ).toThrow('access token');
    }
    // @ts-expect-error Chat models cannot be used through the realtime factory.
    expect(() => factory('gpt-5')).toThrow('gpt-5');
  });

  it('does not pretend to mint a short-lived OpenAI credential', async () => {
    await expect(factory('gpt-realtime').doCreateClientSecret({})).rejects.toThrow(
      'Foundry user access token',
    );
  });

  it('preserves SDK event serialization, session settings and tool results', () => {
    const model = factory('gpt-realtime-1.5');
    expect(
      model.serializeClientEvent({
        type: 'session-update',
        config: { outputModalities: ['text'], turnDetection: { type: 'disabled' } },
      }),
    ).toEqual({
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'gpt-realtime-1.5',
        output_modalities: ['text'],
        audio: { input: { turn_detection: null } },
      },
    });
    expect(
      model.serializeClientEvent({
        type: 'conversation-item-create',
        item: { type: 'function-call-output', callId: 'call-1', output: '{"code":"verified"}' },
      }),
    ).toEqual({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: 'call-1', output: '{"code":"verified"}' },
    });
    expect(
      model.parseServerEvent({
        type: 'response.output_audio.delta',
        delta: 'AAAA',
        item_id: 'item-1',
        response_id: 'resp-1',
      }),
    ).toMatchObject({ type: 'audio-delta', delta: 'AAAA' });
  });
});
