/**
 * Realtime failures → `AiError`. Foundry accepts the WebSocket upgrade even for a bad token or an
 * unknown model, then closes with 1008 and a reason such as
 * `ServiceException: PERMISSION_DENIED (Default:PermissionDenied)`; its error name and code are
 * read from that reason into the `foundry` metadata key. `error` events, which the session
 * survives, map like the Responses in-band errors, under `foundry-openai`.
 */
import * as AiError from 'effect/ai/AiError';
import * as Cause from 'effect/Cause';
import type * as Socket from 'effect/socket/Socket';
import type { ErrorDetails } from './schema.ts';

const module = 'OpenAiRealtime';

const quotaCodes = new Set(['insufficient_quota', 'billing_insufficient_balance']);
const rateLimitCodes = new Set(['rate_limit_exceeded', 'rate_limit_error']);

export const invalidResponse = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidResponseError({ description }) });

export const invalidUserInput = (method: string, description: string): AiError.AiError =>
  AiError.make({ module, method, reason: new AiError.InvalidUserInputError({ description }) });

const networkError = (method: string, url: string, description: string, cause?: unknown) =>
  AiError.make({
    module,
    method,
    reason: new AiError.NetworkError({
      reason: 'TransportError',
      method: 'GET',
      url,
      description,
      cause,
    }),
  });

/** A client event that cannot be written as JSON; retrying cannot help. */
export const encodeError = (url: string, cause: unknown): AiError.AiError =>
  AiError.make({
    module,
    method: 'send',
    reason: new AiError.NetworkError({
      reason: 'EncodeError',
      method: 'GET',
      url,
      description: 'Client event is not JSON-serializable',
      cause,
    }),
  });

export const sendError = (url: string, error: Socket.SocketError): AiError.AiError =>
  networkError('send', url, error.message, error);

/** A send on a socket that is closing or closed, which a WebSocket would drop silently. */
export const closedError = (url: string): AiError.AiError =>
  networkError('send', url, 'The realtime session is closed');

/** Foundry's `Namespace:Name` error name and `UPPER_CASE` code in a close reason. */
const closeDetails = (reason: string) => ({
  errorName: /\b[A-Z]\w*:[A-Z]\w*\b/u.exec(reason)?.[0],
  code: /\b[A-Z]+(?:_[A-Z]+)+\b/u.exec(reason)?.[0],
});

/** A close the client did not ask for, other than 1000. */
export const fromClose = (
  method: string,
  url: string,
  code: number,
  reason: string,
): AiError.AiError => {
  const details = closeDetails(reason);
  const description = `Foundry closed the realtime session with ${code}${reason === '' ? '' : `: ${reason}`}`;
  const common = {
    description,
    metadata: {
      foundry: {
        errorName: details.errorName ?? null,
        errorInstanceId: null,
        code: details.code ?? null,
        type: null,
      },
    },
  };
  const denied = /(?:PermissionDenied|Unauthorized)$/u.test(details.errorName ?? '');
  if (code === 1008 && denied) {
    return AiError.make({
      module,
      method,
      reason: new AiError.AuthenticationError({
        kind:
          details.errorName?.endsWith('Unauthorized') === true
            ? 'InvalidKey'
            : 'InsufficientPermissions',
        ...common,
      }),
    });
  }
  if (code === 1008 || code === 1009) {
    return AiError.make({ module, method, reason: new AiError.InvalidRequestError(common) });
  }
  if (code >= 1011 && code <= 1014) {
    return AiError.make({ module, method, reason: new AiError.InternalProviderError(common) });
  }
  if (code === 1001 || code === 1006) {
    return networkError(method, url, description);
  }
  return AiError.make({ module, method, reason: new AiError.UnknownError(common) });
};

/** A socket failure; a close with 1000 is the end of the session. */
export const fromSocketError = (
  method: string,
  url: string,
  error: Socket.SocketError,
): AiError.AiError | Cause.Done => {
  const { reason } = error;
  if (reason._tag === 'SocketCloseError') {
    return reason.code === 1000
      ? Cause.Done()
      : fromClose(method, url, reason.code, reason.closeReason ?? '');
  }
  if (reason._tag === 'SocketOpenError') {
    return networkError(
      method,
      url,
      reason.kind === 'Timeout'
        ? 'Timed out opening the realtime WebSocket'
        : 'Could not open the realtime WebSocket',
      error,
    );
  }
  return networkError(method, url, reason.message, error);
};

/** An `error` event, which the session survives. */
export const fromErrorEvent = (
  method: string,
  error: typeof ErrorDetails.Type | null | undefined,
): AiError.AiError => {
  const code = error?.code ?? undefined;
  const type = error?.type ?? undefined;
  const metadata = { 'foundry-openai': { code: code ?? null, type: type ?? null } };
  const matches = (codes: ReadonlySet<string>) => codes.has(code ?? '') || codes.has(type ?? '');
  const description =
    [code ?? type, error?.message].filter(Boolean).join(': ') || 'Realtime error event';
  let reason: AiError.AiErrorReason;
  if (matches(quotaCodes)) {
    reason = new AiError.QuotaExhaustedError({ metadata });
  } else if (matches(rateLimitCodes)) {
    reason = new AiError.RateLimitError({ metadata });
  } else if (type === 'invalid_request_error') {
    reason = new AiError.InvalidRequestError({
      description,
      metadata,
      ...(error?.param == null ? undefined : { parameter: error.param }),
    });
  } else {
    reason = new AiError.InternalProviderError({ description, metadata });
  }
  return AiError.make({ module, method, reason });
};
