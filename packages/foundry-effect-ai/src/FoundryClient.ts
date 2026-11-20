/**
 * Authenticated transport to the Foundry LLM proxy, shared by every model module.
 *
 * Owns the proxy base URL, bearer token, attribution and trace headers, and the mapping of
 * HTTP and decode failures to `AiError`. It knows nothing about any vendor wire format:
 * protocol schemas stay in `internal/<protocol>/` so each model module tree-shakes alone.
 */
import type * as AiError from 'effect/ai/AiError';
import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as HttpClient from 'effect/http/HttpClient';
import type * as HttpClientError from 'effect/http/HttpClientError';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Errors from './internal/errors.ts';

export interface Options {
  /** Foundry stack URL, e.g. `https://example.palantirfoundry.com`. Trailing slashes are ignored. */
  readonly foundryUrl: string;
  readonly token: Redacted.Redacted;
  /** Sent as the `attribution` header. */
  readonly attributionRid?: string | undefined;
  /**
   * W3C traceparent, sent as the `traceParent` header. When set, it replaces the trace context
   * the HTTP client would otherwise propagate from the current span.
   */
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
  readonly json: <S extends Schema.Constraint>(
    request: ProxyRequest & { readonly schema: S },
  ) => Effect.Effect<S['Type'], AiError.AiError, S['DecodingServices']>;
}

export class FoundryClient extends Context.Service<FoundryClient, Service>()(
  '@shpitdev/foundry-effect-ai/FoundryClient',
) {}

const optionalHeaders = (headers: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]],
    ),
  );

export const make = Effect.fnUntraced(function* (options: Options) {
  const baseClient = yield* HttpClient.HttpClient;
  const baseUrl = `${options.foundryUrl.trim().replace(/\/+$/u, '')}/api/v2/llm/proxy`;
  const headers = optionalHeaders({
    attribution: options.attributionRid,
    traceParent: options.traceParent,
    traceState: options.traceState,
  });
  const authorized = HttpClient.mapRequest(
    baseClient,
    (request): HttpClientRequest.HttpClientRequest =>
      request.pipe(
        HttpClientRequest.prependUrl(baseUrl),
        HttpClientRequest.bearerToken(options.token),
        HttpClientRequest.setHeaders(headers),
        HttpClientRequest.acceptJson,
      ),
  );
  const client = options.transformClient?.(authorized) ?? authorized;

  const execute = (request: ProxyRequest) => {
    const sent = client.execute(
      HttpClientRequest.post(request.path).pipe(
        HttpClientRequest.setUrlParams(request.urlParams ?? {}),
        HttpClientRequest.setHeaders(request.headers ?? {}),
        HttpClientRequest.bodyJsonUnsafe(request.body),
      ),
    );
    return options.traceParent === undefined
      ? sent
      : Effect.provideService(sent, HttpClient.TracerPropagationEnabled, false);
  };

  const json = <S extends Schema.Constraint>(
    request: ProxyRequest & { readonly schema: S },
  ): Effect.Effect<S['Type'], AiError.AiError, S['DecodingServices']> => {
    const decode = (
      response: HttpClientResponse.HttpClientResponse,
    ): Effect.Effect<
      S['Type'],
      AiError.AiError | HttpClientError.HttpClientError | Schema.SchemaError,
      S['DecodingServices']
    > =>
      response.status >= 200 && response.status < 300
        ? HttpClientResponse.schemaBodyJson(request.schema)(response)
        : Errors.fromResponse('json', response);
    const decoded = Effect.flatMap(execute(request), decode);
    return decoded.pipe(
      Effect.catchTags({
        HttpClientError: (error) => Errors.fromHttpClientError('json', error),
        SchemaError: (error) => Effect.fail(Errors.fromSchemaError('json', error)),
      }),
    );
  };

  return FoundryClient.of({ json });
});

export const layer = (options: Options): Layer.Layer<FoundryClient, never, HttpClient.HttpClient> =>
  Layer.effect(FoundryClient, make(options));

const TraceParent = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u),
);

/** Reads `FOUNDRY_URL`, `FOUNDRY_TOKEN`, and optional `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT`, `FOUNDRY_TRACE_STATE`. */
export const layerConfig = (
  options?: Pick<Options, 'transformClient'>,
): Layer.Layer<FoundryClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    FoundryClient,
    Effect.gen(function* () {
      const config = yield* Config.all({
        foundryUrl: Config.String('FOUNDRY_URL'),
        token: Config.Redacted('FOUNDRY_TOKEN'),
        attributionRid: Config.option(Config.String('FOUNDRY_ATTRIBUTION_RID')),
        traceParent: Config.option(Config.schema(TraceParent, 'FOUNDRY_TRACE_PARENT')),
        traceState: Config.option(Config.String('FOUNDRY_TRACE_STATE')),
      });
      return yield* make({
        foundryUrl: config.foundryUrl,
        token: config.token,
        attributionRid: Option.getOrUndefined(config.attributionRid),
        traceParent: Option.getOrUndefined(config.traceParent),
        traceState: Option.getOrUndefined(config.traceState),
        transformClient: options?.transformClient,
      });
    }),
  );
