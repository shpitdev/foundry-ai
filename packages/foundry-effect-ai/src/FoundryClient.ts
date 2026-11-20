/**
 * Authenticated transport to the Foundry LLM proxy, shared by every model module.
 *
 * Owns the proxy base URL, bearer token, attribution and trace headers, and the mapping of
 * HTTP, decode and SSE failures to `AiError`. It knows nothing about any vendor wire format:
 * protocol schemas stay in `internal/<protocol>/` so each model module tree-shakes alone.
 */
import type * as AiError from 'effect/ai/AiError';
import type * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Sse from 'effect/encoding/Sse';
import type * as HttpClient from 'effect/http/HttpClient';
import * as Layer from 'effect/Layer';
import type * as Redacted from 'effect/Redacted';
import type * as Schema from 'effect/Schema';
import type * as Stream from 'effect/Stream';
import { notImplemented } from './internal/notImplemented.ts';

export interface Options {
  /** Foundry stack URL, e.g. `https://example.palantirfoundry.com`. Trailing slashes are ignored. */
  readonly foundryUrl: string;
  readonly token: Redacted.Redacted;
  /** Sent as the `attribution` header. */
  readonly attributionRid?: string | undefined;
  /** W3C traceparent, sent as the `traceParent` header. */
  readonly traceParent?: string | undefined;
  readonly traceState?: string | undefined;
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined;
}

export interface ProxyRequest {
  /** Path below `${foundryUrl}/api/v2/llm/proxy`, e.g. `/openai/v1/responses`. */
  readonly path: string;
  readonly body: unknown;
  /** Extra query parameters, e.g. `{ alt: 'sse' }` for Gemini streaming. */
  readonly urlParams?: Readonly<Record<string, string>> | undefined;
  /** Extra request headers, e.g. `anthropic-version` or `X-Palantir-session-id`. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface Service {
  /** POST a JSON body and decode the JSON response with `schema`. */
  readonly json: <S extends Schema.Top>(
    request: ProxyRequest & { readonly schema: S },
  ) => Effect.Effect<S['Type'], AiError.AiError, S['DecodingServices']>;
  /** POST a JSON body and stream the server-sent events of the response. */
  readonly sse: (request: ProxyRequest) => Stream.Stream<Sse.Event, AiError.AiError>;
}

export class FoundryClient extends Context.Service<FoundryClient, Service>()(
  '@shpitdev/foundry-effect-ai/FoundryClient',
) {}

export const make = (_options: Options): Effect.Effect<Service, never, HttpClient.HttpClient> =>
  notImplemented('FoundryClient.make');

export const layer = (options: Options): Layer.Layer<FoundryClient, never, HttpClient.HttpClient> =>
  Layer.effect(FoundryClient, make(options));

/** Reads `FOUNDRY_URL`, `FOUNDRY_TOKEN`, and optional `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT`, `FOUNDRY_TRACE_STATE`. */
export const layerConfig = (
  _options?: Pick<Options, 'transformClient'>,
): Layer.Layer<FoundryClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(FoundryClient, notImplemented('FoundryClient.layerConfig'));
