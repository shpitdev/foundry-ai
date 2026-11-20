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
import * as Sse from 'effect/encoding/Sse';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import type * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as Errors from './internal/errors.ts';
// Types this package adds under its own metadata keys. A bare import keeps it in every module's
// declarations, since each one imports this file.
// oxlint-disable-next-line import/no-unassigned-import
import './internal/metadata.ts';

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
  /**
   * POST a JSON body and stream the server-sent events of the response. The stream fails with
   * `InvalidResponseError` on malformed framing and `NetworkError` if the body read fails;
   * deciding whether the stream ended properly is the protocol's job.
   */
  readonly sse: (request: ProxyRequest) => Stream.Stream<Sse.Event, AiError.AiError>;
}

export class FoundryClient extends Context.Service<FoundryClient, Service>()(
  '@shpitdev/foundry-effect-ai/FoundryClient',
) {}

export const make = Effect.fnUntraced(function* (options: Options) {
  const baseClient = yield* HttpClient.HttpClient;
  const baseUrl = `${options.foundryUrl.trim().replace(/\/+$/u, '')}/api/v2/llm/proxy`;
  // `setHeaders` drops undefined values.
  const headers = {
    attribution: options.attributionRid,
    traceParent: options.traceParent,
    traceState: options.traceState,
  };
  // Non-2xx responses fail before `transformClient`, so its retries and taps see them.
  const authorized = HttpClient.mapRequest(
    baseClient,
    (request): HttpClientRequest.HttpClientRequest =>
      request.pipe(
        HttpClientRequest.prependUrl(baseUrl),
        HttpClientRequest.bearerToken(options.token),
        HttpClientRequest.setHeaders(headers),
      ),
  ).pipe(HttpClient.filterStatusOk);
  const client = options.transformClient?.(authorized) ?? authorized;

  const execute = (request: HttpClientRequest.HttpClientRequest) => {
    const sent = client.execute(request);
    return options.traceParent === undefined
      ? sent
      : Effect.provideService(sent, HttpClient.TracerPropagationEnabled, false);
  };

  /**
   * Encodes the body and sends the request. A non-2xx status fails with the mapped error, also
   * when `transformClient` returns the failed response instead of its error.
   */
  const send = (method: string, request: ProxyRequest, accept: string) => {
    const unsent = HttpClientRequest.post(request.path).pipe(
      HttpClientRequest.setUrlParams(request.urlParams ?? {}),
      HttpClientRequest.accept(accept),
      HttpClientRequest.setHeaders(request.headers ?? {}),
    );
    return Effect.gen(function* () {
      const sendable = yield* Effect.catchTag(
        HttpClientRequest.bodyJson(unsent, request.body),
        'HttpBodyError',
        (error) => Errors.fromBodyError(method, unsent, error),
      );
      const response = yield* execute(sendable);
      if (response.status < 200 || response.status >= 300) {
        return yield* Errors.fromResponse(method, response);
      }
      return response;
    });
  };

  const json = <S extends Schema.Constraint>(
    request: ProxyRequest & { readonly schema: S },
  ): Effect.Effect<S['Type'], AiError.AiError, S['DecodingServices']> => {
    const decode = Schema.decodeEffect(Schema.fromJsonString(Schema.toCodecJson(request.schema)));
    return Effect.gen(function* () {
      const response = yield* send('json', request, 'application/json');
      const body = yield* response.text;
      if (body === '') {
        return yield* Errors.invalidResponse(
          'json',
          `HTTP ${response.status} response has no body`,
        );
      }
      return yield* Effect.mapError(decode(body), (error) => Errors.fromSchemaError('json', error));
    }).pipe(
      Effect.catchTag('HttpClientError', (error) => Errors.fromHttpClientError('json', error)),
    );
  };

  const sse = (request: ProxyRequest): Stream.Stream<Sse.Event, AiError.AiError> =>
    send('sse', request, 'text/event-stream').pipe(
      Effect.map((response) =>
        response.stream.pipe(
          Stream.decodeText(),
          Stream.pipeThroughChannel(Sse.decode()),
          Stream.catchTags({
            HttpClientError: (error) => Stream.fromEffect(Errors.fromHttpClientError('sse', error)),
            SseError: (error) => Stream.fail(Errors.invalidResponse('sse', error.message)),
            Retry: () =>
              Stream.fail(Errors.invalidResponse('sse', 'Unexpected SSE retry directive')),
          }),
        ),
      ),
      Effect.catchTag('HttpClientError', (error) => Errors.fromHttpClientError('sse', error)),
      Stream.unwrap,
    );

  return FoundryClient.of({ json, sse });
});

export const layer = (options: Options): Layer.Layer<FoundryClient, never, HttpClient.HttpClient> =>
  Layer.effect(FoundryClient, make(options));

/** A trimmed string; blank counts as unset. */
const optional = (name: string, schema: Schema.Codec<string, string>) =>
  Config.option(Config.schema(schema, name)).pipe(
    Config.map((value) => Option.getOrUndefined(Option.filter(value, (text) => text !== ''))),
  );

const TraceParent = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.Union([
      Schema.Literal(''),
      Schema.String.check(Schema.isPattern(/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u)),
    ]),
  ),
);

/**
 * Reads `FOUNDRY_URL`, `FOUNDRY_TOKEN`, and optional `FOUNDRY_ATTRIBUTION_RID`,
 * `FOUNDRY_TRACE_PARENT`, `FOUNDRY_TRACE_STATE`. Values are trimmed, blank optional values are
 * unset, and a blank token fails.
 */
export const layerConfig = (
  options?: Pick<Options, 'transformClient'>,
): Layer.Layer<FoundryClient, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(
    FoundryClient,
    Effect.gen(function* () {
      const config = yield* Config.all({
        foundryUrl: Config.schema(
          Schema.Trim.pipe(Schema.decodeTo(Schema.NonEmptyString)),
          'FOUNDRY_URL',
        ),
        token: Config.schema(
          Schema.Redacted(Schema.Trim.pipe(Schema.decodeTo(Schema.NonEmptyString))),
          'FOUNDRY_TOKEN',
        ),
        attributionRid: optional('FOUNDRY_ATTRIBUTION_RID', Schema.Trim),
        traceParent: optional('FOUNDRY_TRACE_PARENT', TraceParent),
        traceState: optional('FOUNDRY_TRACE_STATE', Schema.Trim),
      });
      return yield* make({ ...config, transformClient: options?.transformClient });
    }),
  );
