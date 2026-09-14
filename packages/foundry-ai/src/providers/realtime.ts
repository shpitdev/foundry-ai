import { Experimental_OpenAIRealtimeModel as OpenAIRealtimeModel } from '@ai-sdk/openai';
import type {
  Experimental_RealtimeModel as RealtimeModel,
  Experimental_RealtimeSetupResponse as RealtimeSetupResponse,
} from 'ai';
import { FoundryModelNotFoundError } from '../errors.js';
import { REALTIME_MODELS, type RealtimeModelId } from '../models/realtime-models.js';

export interface FoundryRealtimeConfig {
  foundryUrl: string;
}

/** AI SDK 7 realtime models using Foundry's native WebSocket proxy. */
export function createFoundryRealtime(config: FoundryRealtimeConfig) {
  const origin = getFoundryOrigin(config.foundryUrl);
  return (modelId: RealtimeModelId): RealtimeModel => {
    const url = getRealtimeUrl(origin, modelId);
    const native = new OpenAIRealtimeModel(modelId, {
      provider: 'foundry-realtime',
      baseURL: origin,
      headers: () => ({}),
    });
    return {
      specificationVersion: native.specificationVersion,
      provider: native.provider,
      modelId,
      async doCreateClientSecret() {
        throw new Error(
          'Foundry realtime uses a Foundry user access token, not OpenAI client secrets. Use createFoundryRealtimeSetup with the authenticated user token.',
        );
      },
      getWebSocketConfig(options) {
        // Never forward a Foundry credential to a URL supplied by an untrusted setup response.
        if (options.url !== url) {
          throw new Error('Realtime setup URL does not match the configured Foundry model.');
        }
        validateToken(options.token);
        return { url, protocols: [`Bearer-${options.token}`] };
      },
      parseServerEvent: (raw) => native.parseServerEvent(raw),
      serializeClientEvent: (event) => native.serializeClientEvent(event),
      buildSessionConfig: (session) => native.buildSessionConfig(session),
    };
  };
}

/** Returns SDK setup data with an existing user token; does not mint or narrow credentials. */
export function createFoundryRealtimeSetup(
  options: FoundryRealtimeConfig & {
    model: RealtimeModelId;
    token: string;
    tools?: RealtimeSetupResponse['tools'];
  },
): RealtimeSetupResponse {
  validateToken(options.token);
  return {
    token: options.token,
    url: getRealtimeUrl(getFoundryOrigin(options.foundryUrl), options.model),
    tools: options.tools ?? [],
  };
}

function getFoundryOrigin(foundryUrl: string): string {
  const url = new URL(foundryUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Foundry realtime requires an HTTPS Foundry URL without credentials or query.');
  }
  if (url.pathname !== '/') {
    throw new Error('Foundry realtime requires the Foundry origin without a path.');
  }
  return url.origin;
}

function getRealtimeUrl(origin: string, modelId: RealtimeModelId): string {
  if (!Object.hasOwn(REALTIME_MODELS, modelId)) {
    throw new FoundryModelNotFoundError(modelId);
  }
  const url = new URL('/language-model-service/ws/v1/open-ai/realtime', origin);
  url.protocol = 'wss:';
  url.searchParams.set('model', modelId);
  return url.toString();
}

function validateToken(token: string): void {
  if (!token || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(token)) {
    throw new Error('A valid Foundry user access token is required for realtime.');
  }
}
