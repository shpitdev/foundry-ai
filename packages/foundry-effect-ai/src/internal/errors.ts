// Adapted from @effect/ai-openai (MIT), effect@4.1.4, 82904fe.
/**
 * Maps Foundry proxy failures to `AiError`. Foundry reports its own failures in a Conjure
 * envelope (`errorCode`, `errorName`, `errorInstanceId`, `parameters`) and nests a vendor's
 * rejection in `parameters.responseBody`. Vendor bodies are read leniently as
 * `error.{message,type,code,status}`, which covers OpenAI, Anthropic and Gemini.
 */
import * as AiError from 'effect/ai/AiError';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Headers from 'effect/http/Headers';
import type * as HttpClientError from 'effect/http/HttpClientError';
import type * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

const module = 'FoundryClient';

const ProxyError = Schema.Struct({
  errorName: Schema.optional(Schema.String),
  errorInstanceId: Schema.optional(Schema.String),
  parameters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const VendorError = Schema.Struct({
  error: Schema.Struct({
    message: Schema.optional(Schema.String),
    type: Schema.optional(Schema.NullOr(Schema.String)),
    code: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Finite]))),
    status: Schema.optional(Schema.NullOr(Schema.String)),
  }),
});

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));
const decodeProxyError = Schema.decodeUnknownOption(ProxyError);
const decodeVendorError = Schema.decodeUnknownOption(VendorError);

const redactedHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

// Quota exhaustion arrives as 429 with one of these codes; plain throttling does not.
const quotaCodes = new Set(['insufficient_quota', 'billing_insufficient_balance']);

interface Details {
  readonly message: string | undefined;
  readonly code: string | undefined;
  readonly type: string | undefined;
  readonly errorName: string | undefined;
  readonly errorInstanceId: string | undefined;
}

const readDetails = (body: string): Details => {
  const json = decodeJson(body);
  const proxy = Option.getOrUndefined(Option.flatMap(json, decodeProxyError));
  const nested = proxy?.parameters?.['responseBody'];
  // Foundry prints the vendor body as a Java Optional: `Optional[{...}]`.
  const vendorJson =
    typeof nested === 'string' ? decodeJson(nested.replace(/^Optional\[(.*)\]$/su, '$1')) : json;
  const vendor = Option.getOrUndefined(Option.flatMap(vendorJson, decodeVendorError))?.error;
  const proxyMessage = proxy?.parameters?.['message'];
  return {
    message: vendor?.message ?? (typeof proxyMessage === 'string' ? proxyMessage : undefined),
    code: vendor?.code == null ? proxy?.errorName : String(vendor.code),
    type: vendor?.type ?? vendor?.status ?? undefined,
    errorName: proxy?.errorName,
    errorInstanceId: proxy?.errorInstanceId,
  };
};

const statusReason = (
  status: number,
  details: Details,
  common: {
    readonly description: string;
    readonly metadata: AiError.ProviderMetadata;
    readonly http: typeof AiError.HttpContext.Type;
  },
  retryAfter: string | undefined,
  now: number,
): AiError.AiErrorReason => {
  switch (status) {
    case 400:
    case 404:
    case 409:
    case 422:
      return new AiError.InvalidRequestError(common);
    case 401:
      return new AiError.AuthenticationError({ kind: 'InvalidKey', ...common });
    case 403:
      return new AiError.AuthenticationError({ kind: 'InsufficientPermissions', ...common });
    case 402:
      return new AiError.QuotaExhaustedError({ metadata: common.metadata, http: common.http });
    case 429: {
      if (quotaCodes.has(details.code ?? '') || quotaCodes.has(details.type ?? '')) {
        return new AiError.QuotaExhaustedError({ metadata: common.metadata, http: common.http });
      }
      const parsed = retryAfter === undefined ? undefined : Headers.parseRetryAfter(retryAfter);
      return new AiError.RateLimitError({
        retryAfter:
          parsed !== undefined && Result.isSuccess(parsed)
            ? Headers.retryAfterDelay(parsed.success, now)
            : undefined,
        metadata: common.metadata,
        http: common.http,
      });
    }
    default:
      return status >= 500
        ? new AiError.InternalProviderError(common)
        : new AiError.UnknownError(common);
  }
};

/** Fails with the `AiError` for a non-2xx proxy response. */
export const fromResponse = Effect.fnUntraced(function* (
  method: string,
  response: HttpClientResponse.HttpClientResponse,
) {
  const body = yield* Effect.orElseSucceed(response.text, () => '');
  const now = yield* Clock.currentTimeMillis;
  const details = readDetails(body);
  const reason = statusReason(
    response.status,
    details,
    {
      description: AiError.buildErrorDescription({
        status: response.status,
        message: details.message,
        method: response.request.method,
        url: response.request.url,
        errorCode: details.code,
        errorType: details.type,
        requestId: details.errorInstanceId,
        body,
      }),
      metadata: {
        foundry: {
          errorName: details.errorName ?? null,
          errorInstanceId: details.errorInstanceId ?? null,
          code: details.code ?? null,
          type: details.type ?? null,
        },
      },
      http: {
        response: {
          status: response.status,
          headers: Headers.redact(response.headers, redactedHeaders),
        },
        ...(body === '' ? undefined : { body }),
      },
    },
    response.headers['retry-after'],
    now,
  );
  return yield* AiError.make({ module, method, reason });
});

/** Maps transport, status and body-read failures. */
export const fromHttpClientError = (
  method: string,
  error: HttpClientError.HttpClientError,
): Effect.Effect<never, AiError.AiError> => {
  const { reason } = error;
  if (reason._tag === 'StatusCodeError') {
    return fromResponse(method, reason.response);
  }
  if (reason._tag === 'DecodeError' || reason._tag === 'EmptyBodyError') {
    return Effect.fail(
      AiError.make({
        module,
        method,
        reason: new AiError.InvalidResponseError({
          description: `HTTP ${reason.response.status} body is not valid JSON`,
        }),
      }),
    );
  }
  return Effect.fail(
    AiError.make({
      module,
      method,
      reason: new AiError.NetworkError({
        reason: reason._tag,
        method: reason.request.method,
        url: reason.request.url,
        description: reason.description,
        cause: error,
      }),
    }),
  );
};

/** A 2xx body that does not match the protocol schema. */
export const fromSchemaError = (method: string, error: Schema.SchemaError): AiError.AiError =>
  AiError.make({ module, method, reason: AiError.InvalidResponseError.fromSchemaError(error) });
