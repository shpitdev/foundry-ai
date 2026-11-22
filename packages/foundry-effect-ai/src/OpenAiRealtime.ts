/**
 * OpenAI realtime sessions through Foundry's WebSocket proxy, for `gpt-realtime` models.
 *
 * Effect AI has no realtime service, so this module is a typed session over
 * `effect/socket/Socket`: client events in, decoded server events out, and helpers that run a
 * `Toolkit`'s handlers for the model's function calls. The caller passes its own Foundry token
 * and provides `Socket.WebSocketConstructor`, usually `Socket.layerWebSocketConstructorGlobal`.
 */
import * as AiError from 'effect/ai/AiError';
import * as Tool from 'effect/ai/Tool';
import type * as Toolkit from 'effect/ai/Toolkit';
import * as Cause from 'effect/Cause';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';
import * as Socket from 'effect/socket/Socket';
import * as Stream from 'effect/Stream';
import type { models } from './internal/models/realtime.ts';
import * as Errors from './internal/openai-realtime/errors.ts';
import * as Wire from './internal/openai-realtime/schema.ts';
// Types this package adds under its own metadata keys, for the errors this module builds.
// oxlint-disable-next-line import/no-unassigned-import
import './internal/metadata.ts';

/** A realtime model's API name. The route takes API names, not RIDs. */
export type ModelId = keyof typeof models | (string & Record<never, never>);

export type ClientEvent = Wire.ClientEvent;
export type ServerEvent = Wire.ServerEvent;
export type SessionConfig = Wire.SessionConfig;
export type ResponseConfig = Wire.ResponseConfig;
export type ConversationItem = Wire.ConversationItem;
export type FunctionTool = Wire.FunctionTool;
export type AudioFormat = Wire.AudioFormat;
export type TurnDetection = Wire.TurnDetection;
export type OutputItem = typeof Wire.OutputItem.Type;

export interface Options {
  readonly model: ModelId;
  /**
   * Foundry stack URL, e.g. `https://example.palantirfoundry.com`: an HTTPS origin without a
   * path, credentials, query or fragment. Trailing slashes are ignored.
   */
  readonly foundryUrl: string;
  /**
   * The caller's own Foundry access token with `language-model-service:use-model`, sent as the
   * `Bearer-<token>` WebSocket subprotocol. In a browser this is the signed-in user's token;
   * never hand a shared server token to a browser.
   */
  readonly token: Redacted.Redacted;
  /** How long to wait for the socket to open. Defaults to 10 seconds. */
  readonly openTimeout?: Duration.Input | undefined;
}

export interface Session {
  /** Sends one client event. */
  readonly send: (event: ClientEvent) => Effect.Effect<void, AiError.AiError>;
  /**
   * Server events in order, starting with `session.created`; event types this module does not
   * decode are skipped. A close with code 1000 ends the stream; any other close, a socket failure
   * or a malformed frame fails it. `error` events arrive as events, since the session survives
   * them; see `failOnError`. Events are pulled one at a time, so a consumer that stops early
   * loses nothing and running the stream again continues from there. Use one consumer at a time.
   */
  readonly events: Stream.Stream<ServerEvent, AiError.AiError>;
}

// RFC 7230 token characters: anything else cannot travel in a subprotocol.
const tokenPattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

const realtimeUrl = (foundryUrl: string, model: string): string | undefined => {
  const base = foundryUrl.trim().replace(/\/+$/u, '');
  if (!URL.canParse(base)) {
    return undefined;
  }
  const origin = new URL(base);
  if (
    origin.protocol !== 'https:' ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.pathname !== '/'
  ) {
    return undefined;
  }
  const url = new URL('/language-model-service/ws/v1/open-ai/realtime', origin.origin);
  url.protocol = 'wss:';
  url.searchParams.set('model', model);
  return url.toString();
};

const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const decodeEvent = Schema.decodeUnknownEffect(Wire.ServerEvent);
const decodeArguments = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json));

const isArray = (value: unknown): value is ReadonlyArray<unknown> => Array.isArray(value);

const isKnown = (types: ReadonlySet<string>, value: unknown): boolean =>
  Predicate.hasProperty(value, 'type') && typeof value.type === 'string' && types.has(value.type);

/** `response.done` with only the output items this module decodes. */
const knownOutput = (data: object): object => {
  const response = Predicate.hasProperty(data, 'response') ? data.response : undefined;
  if (!Predicate.hasProperty(response, 'output') || !isArray(response.output)) {
    return data;
  }
  const output = response.output.filter((item) => isKnown(Wire.outputItemTypes, item));
  return { ...data, response: { ...response, output } };
};

/** The event in a frame, or null for an event type this module skips. */
const decodeFrame = Effect.fnUntraced(function* (method: string, frame: string) {
  const data = yield* Effect.mapError(decodeJson(frame), () =>
    Errors.invalidResponse(method, 'Realtime frame is not JSON'),
  );
  if (!Predicate.isObject(data) || !isKnown(Wire.eventTypes, data)) {
    return null;
  }
  return yield* Effect.mapError(
    decodeEvent(
      Predicate.hasProperty(data, 'type') && data.type === 'response.done'
        ? knownOutput(data)
        : data,
    ),
    (error) => Errors.invalidResponse(method, error.message),
  );
});

const closedEarly = (error: AiError.AiError | Cause.Done) =>
  Cause.isDone(error)
    ? Errors.invalidResponse('connect', 'Foundry closed the session before session.created')
    : error;

/**
 * Opens a session, and waits for `session.created` so a refused token or model fails here. The
 * session lasts until the scope closes, which closes the socket with code 1000.
 */
export const connect: (
  options: Options,
) => Effect.Effect<Session, AiError.AiError, Socket.WebSocketConstructor | Scope.Scope> =
  Effect.fnUntraced(function* (options: Options) {
    const url = realtimeUrl(options.foundryUrl, options.model);
    if (url === undefined) {
      return yield* Errors.invalidUserInput(
        'connect',
        'Foundry realtime needs an HTTPS Foundry URL without a path, credentials, query or fragment',
      );
    }
    const token = Redacted.value(options.token).trim();
    if (!tokenPattern.test(token)) {
      return yield* Errors.invalidUserInput(
        'connect',
        'Foundry realtime needs a Foundry access token made of subprotocol-safe characters',
      );
    }
    const socket = yield* Socket.makeWebSocket(url, {
      protocols: [`Bearer-${token}`],
      openTimeout: options.openTimeout,
    });
    const pull = yield* Effect.mapError(Socket.readerString(socket), (error) =>
      closedEarly(Errors.fromSocketError('connect', url, error)),
    );
    const writer = yield* socket.writer;

    // Frames pulled but not yet decoded, and events `connect` read ahead.
    const frames: Array<string> = [];
    const pending: Array<ServerEvent> = [];
    const readEvent = (method: string) =>
      // A pulled batch is kept even if the reader is interrupted right after the pull.
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          for (;;) {
            const frame = frames.shift();
            if (frame === undefined) {
              const batch = yield* restore(
                Effect.mapError(pull, (error) => Errors.fromSocketError(method, url, error)),
              );
              frames.push(...batch);
              continue;
            }
            const event = yield* decodeFrame(method, frame);
            if (event !== null) {
              return event;
            }
          }
        }),
      );

    for (;;) {
      const event = yield* Effect.mapError(readEvent('connect'), closedEarly);
      if (event.type === 'error') {
        return yield* Errors.fromErrorEvent('connect', event.error);
      }
      pending.push(event);
      if (event.type === 'session.created') {
        break;
      }
    }

    const reading = Semaphore.makeUnsafe(1);
    const next = Semaphore.withPermit(reading)(
      Effect.suspend(() => {
        const event = pending.shift();
        return event === undefined ? readEvent('events') : Effect.succeed(event);
      }),
    );

    const send = (event: ClientEvent): Effect.Effect<void, AiError.AiError> =>
      encodeJson(event).pipe(
        Effect.mapError((error) => Errors.encodeError(url, error)),
        Effect.flatMap((text) =>
          Effect.mapError(writer.write(text), (error) => Errors.sendError(url, error)),
        ),
      );

    return { send, events: Stream.fromEffectRepeat(next) } satisfies Session;
  });

/**
 * Function tools for `session.update`, from a toolkit's tools. Provider-defined tools are not
 * supported.
 */
export const tools = (toolkit: {
  readonly tools: Readonly<Record<string, Tool.Any>>;
}): Effect.Effect<ReadonlyArray<FunctionTool>, AiError.AiError> =>
  Effect.forEach(Object.values(toolkit.tools), (tool) =>
    Effect.gen(function* () {
      if (Tool.isProviderDefined(tool)) {
        return yield* AiError.make({
          module: 'OpenAiRealtime',
          method: 'tools',
          reason: new AiError.InvalidRequestError({
            description: `Provider-defined tool '${tool.name}' is not supported`,
          }),
        });
      }
      const parameters = yield* Effect.try({
        try: () => Tool.getJsonSchema(tool),
        catch: (error) =>
          AiError.make({
            module: 'OpenAiRealtime',
            method: 'tools',
            reason: new AiError.UnsupportedSchemaError({
              description: error instanceof Error ? error.message : String(error),
            }),
          }),
      });
      const description = Tool.getDescription(tool);
      return {
        type: 'function',
        name: String(tool.name),
        parameters,
        ...(description === undefined ? undefined : { description }),
      } satisfies FunctionTool;
    }),
  );

const toolError = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: 'OpenAiRealtime', method: 'handleToolCalls', reason });

const hasTool = <Tools extends Record<string, Tool.Any>>(
  available: Tools,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(available, name);

/** The name of a tool in the toolkit, or `ToolNotFoundError`. */
const toolName = <Tools extends Record<string, Tool.Any>>(
  available: Tools,
  name: string,
): Effect.Effect<Extract<keyof Tools, string>, AiError.AiError> =>
  hasTool(available, name)
    ? Effect.succeed(name)
    : Effect.fail(
        toolError(
          new AiError.ToolNotFoundError({ toolName: name, availableTools: Object.keys(available) }),
        ),
      );

/**
 * Passes events through and answers the model's function calls. After each completed
 * `response.done` that has `function_call` items, it runs each call through the toolkit's
 * handler, sends the final encoded result as a `function_call_output` item, then one
 * `response.create` with `options.response`. Waiting for `response.done` keeps a new response
 * from starting while one is active.
 */
export const handleToolCalls =
  <Tools extends Record<string, Tool.Any>>(
    session: Session,
    toolkit: Toolkit.WithHandler<Tools>,
    options?: { readonly response?: ResponseConfig | undefined },
  ) =>
  <E, R>(
    events: Stream.Stream<ServerEvent, E, R>,
  ): Stream.Stream<
    ServerEvent,
    E | AiError.AiError | Tool.HandlerError<Tools[keyof Tools]>,
    R | Tool.HandlerServices<Tools[keyof Tools]>
  > => {
    const answer = Effect.fnUntraced(function* (output: ReadonlyArray<OutputItem>) {
      const calls = output.filter((item) => item.type === 'function_call');
      for (const call of calls) {
        const name = yield* toolName(toolkit.tools, call.name);
        const params = yield* Effect.mapError(decodeArguments(call.arguments), (error) =>
          toolError(
            new AiError.ToolParameterValidationError({
              toolName: name,
              description: `Arguments are not JSON: ${error.message}`,
            }),
          ),
        );
        const results = yield* toolkit.handle(name, params, call.call_id);
        const final = yield* Stream.runLast(
          Stream.filter(results, (result) => !result.preliminary),
        ).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  toolError(
                    new AiError.InvalidToolResultError({
                      toolName: name,
                      description: 'The handler finished without a result',
                    }),
                  ),
                ),
              onSome: Effect.succeed,
            }),
          ),
        );
        const text = yield* Effect.mapError(encodeJson(final.encodedResult), (error) =>
          toolError(
            new AiError.ToolResultEncodingError({
              toolName: name,
              toolResult: final.encodedResult,
              description: error.message,
            }),
          ),
        );
        yield* session.send({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: call.call_id, output: text },
        });
      }
      if (calls.length > 0) {
        yield* session.send({
          type: 'response.create',
          ...(options?.response === undefined ? undefined : { response: options.response }),
        });
      }
    });
    return Stream.tap(events, (event) =>
      event.type === 'response.done' && event.response.status === 'completed'
        ? answer(event.response.output)
        : Effect.void,
    );
  };

/** Fails the stream on an `error` event, mapped to `AiError`. */
export const failOnError = <E, R>(
  events: Stream.Stream<ServerEvent, E, R>,
): Stream.Stream<ServerEvent, E | AiError.AiError, R> =>
  Stream.mapEffect(events, (event) =>
    event.type === 'error'
      ? Effect.fail(Errors.fromErrorEvent('events', event.error))
      : Effect.succeed(event),
  );
