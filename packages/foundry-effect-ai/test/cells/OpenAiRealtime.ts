import { expect } from '@effect/vitest';
import type * as AiError from 'effect/ai/AiError';
import * as Tool from 'effect/ai/Tool';
import * as Toolkit from 'effect/ai/Toolkit';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';
import * as OpenAiRealtime from '../../src/OpenAiRealtime.ts';
import type { Cell, Env } from '../harness.ts';

type ServerEvent = OpenAiRealtime.ServerEvent;

const defaultModel = 'gpt-realtime-2.1';
const pcm = { type: 'audio/pcm', rate: 24_000 } as const;

// Text first, voice detection off, both audio directions at 24 kHz PCM, as the AI SDK suite does.
const setup: OpenAiRealtime.SessionConfig = {
  type: 'realtime',
  output_modalities: ['text'],
  audio: { input: { format: pcm, turn_detection: null }, output: { format: pcm } },
};

// A fixed code the model cannot guess, so the recorded tool round-trip replays exactly.
const code = 'VERIFIED_k3v9q2xa';
const LookupCode = Tool.make('lookupCode', {
  description: 'Look up the secret verification code.',
  success: Schema.Struct({ code: Schema.String }),
});
const toolkit = Toolkit.make(LookupCode);
const handlers = toolkit.toLayer({ lookupCode: () => Effect.succeed({ code }) });

const connect = (env: Env, model: string, overrides?: Partial<OpenAiRealtime.Options>) =>
  Effect.provide(OpenAiRealtime.connect({ model, ...env.settings, ...overrides }), env.sockets);

/** Events up to and including the next one of `type`; an `error` event fails. */
const until = (session: OpenAiRealtime.Session, type: ServerEvent['type']) =>
  session.events.pipe(
    OpenAiRealtime.failOnError,
    Stream.takeUntil((event) => event.type === type),
    Stream.runCollect,
  );

const configure = (session: OpenAiRealtime.Session, config: OpenAiRealtime.SessionConfig) =>
  Effect.gen(function* () {
    yield* session.send({ type: 'session.update', session: config });
    expect((yield* until(session, 'session.updated')).at(-1)?.type).toBe('session.updated');
  });

const say = (session: OpenAiRealtime.Session, text: string) =>
  session.send({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  });

/** Sends `text`, asks for one response and returns its events, which must complete. */
const ask = (session: OpenAiRealtime.Session, text: string, modality: 'text' | 'audio') =>
  Effect.gen(function* () {
    yield* say(session, text);
    yield* session.send({ type: 'response.create', response: { output_modalities: [modality] } });
    const events = yield* until(session, 'response.done');
    expectCompleted(events);
    return events;
  });

const expectCompleted = (events: ReadonlyArray<ServerEvent>) => {
  expect(events.at(-1)).toMatchObject({ type: 'response.done', response: { status: 'completed' } });
};

const joined = (events: ReadonlyArray<ServerEvent>, type: ServerEvent['type']) =>
  events.map((event) => (event.type === type && 'delta' in event ? event.delta : '')).join('');

/** One spoken sentence from a fresh session: 24 kHz PCM and its transcript. */
const speak = (env: Env, model: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* connect(env, model);
      yield* configure(session, setup);
      const events = yield* ask(
        session,
        'Read this ordinary sentence aloud exactly: The garden contains a sunflower.',
        'audio',
      );
      const audio = Buffer.concat(
        events.flatMap((event) =>
          event.type === 'response.output_audio.delta' ? [Buffer.from(event.delta, 'base64')] : [],
        ),
      );
      return { audio, transcript: joined(events, 'response.output_audio_transcript.delta') };
    }),
  );

const reasonOf = <A, R>(effect: Effect.Effect<A, AiError.AiError, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.orDie,
    Effect.map((error) => error.reason),
  );

export const cellsFor = (model: string): Readonly<Record<string, Cell>> => ({
  connect: (env) =>
    Effect.scoped(
      Effect.gen(function* () {
        const session = yield* connect(env, model);
        const [created] = yield* session.events.pipe(Stream.take(1), Stream.runCollect);
        expect(created).toMatchObject({
          type: 'session.created',
          session: { id: expect.any(String), model },
        });
        if (!env.live) {
          expect(env.sessions).toMatchObject([
            {
              url: `wss://example.palantirfoundry.com/language-model-service/ws/v1/open-ai/realtime?model=${model}`,
              protocols: ['Bearer-token-123'],
            },
          ]);
        }
      }),
    ),

  text: (env) =>
    Effect.scoped(
      Effect.gen(function* () {
        const session = yield* connect(env, model);
        yield* configure(session, setup);
        const events = yield* ask(session, 'Reply with READY.', 'text');
        expect(joined(events, 'response.output_text.delta')).toContain('READY');
      }),
    ),

  // The model calls the tool; `handleToolCalls` runs the toolkit handler, sends the result and
  // asks for the answer, which must quote the code.
  tools: (env) =>
    Effect.scoped(
      Effect.gen(function* () {
        const session = yield* connect(env, model);
        const withHandlers = yield* toolkit;
        yield* configure(session, { ...setup, tools: yield* OpenAiRealtime.tools(toolkit) });
        yield* say(
          session,
          'Call lookupCode exactly once, then reply with the exact code returned by the tool.',
        );
        yield* session.send({ type: 'response.create', response: { output_modalities: ['text'] } });
        const events = yield* session.events.pipe(
          OpenAiRealtime.handleToolCalls(session, withHandlers, {
            response: { output_modalities: ['text'] },
          }),
          OpenAiRealtime.failOnError,
          Stream.takeUntil(
            (event) =>
              event.type === 'response.done' &&
              !event.response.output.some((item) => item.type === 'function_call'),
          ),
          Stream.runCollect,
        );
        const calls = events.filter(
          (event) => event.type === 'response.function_call_arguments.done',
        );
        expect(calls).toMatchObject([{ name: 'lookupCode' }]);
        const answered = events.findIndex((event) => event.type === 'response.done');
        expectCompleted(events);
        expect(joined(events.slice(answered + 1), 'response.output_text.delta')).toContain(code);
      }),
    ).pipe(Effect.provide(handlers)),

  'audio-output': (env) =>
    Effect.gen(function* () {
      const { audio, transcript } = yield* speak(env, model);
      // More than 0.1 s of 16-bit audio, and not silence.
      expect(audio.length).toBeGreaterThan(4800);
      expect(audio.some((sample) => sample !== 0)).toBe(true);
      expect(transcript.toLowerCase()).toContain('sunflower');
    }),

  // A fresh session, so the answer cannot come from the text that produced the audio.
  'audio-input': (env) =>
    Effect.gen(function* () {
      const { audio } = yield* speak(env, model);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connect(env, model);
          yield* configure(session, {
            type: 'realtime',
            instructions: 'Repeat the words you hear in the audio.',
            output_modalities: ['text'],
            audio: { input: { format: pcm, turn_detection: null } },
          });
          yield* session.send({
            type: 'input_audio_buffer.append',
            audio: audio.toString('base64'),
          });
          yield* session.send({ type: 'input_audio_buffer.commit' });
          yield* until(session, 'input_audio_buffer.committed');
          yield* session.send({
            type: 'response.create',
            response: { output_modalities: ['text'] },
          });
          const events = yield* until(session, 'response.done');
          expectCompleted(events);
          expect(joined(events, 'response.output_text.delta').toLowerCase()).toContain('sunflower');
        }),
      );
    }),
});

export const cells: Readonly<Record<string, Cell>> = {
  ...cellsFor(defaultModel),

  // Foundry opens the socket, then closes it with 1008 for a bad token or an unknown model.
  'error-mapping': (env) =>
    Effect.gen(function* () {
      const refused = yield* reasonOf(
        Effect.scoped(connect(env, defaultModel, { token: Redacted.make('invalid-token') })),
      );
      expect(refused).toMatchObject({
        _tag: 'AuthenticationError',
        kind: 'InsufficientPermissions',
        metadata: { foundry: { errorName: 'Default:PermissionDenied', code: 'PERMISSION_DENIED' } },
      });
      const unknown = yield* reasonOf(Effect.scoped(connect(env, 'gpt-realtime-does-not-exist')));
      expect(unknown).toMatchObject({
        _tag: 'InvalidRequestError',
        metadata: { foundry: { errorName: 'LanguageModelService:ProxyModelNotFound' } },
      });
      expect(unknown.message).toContain('gpt-realtime-does-not-exist');
      if (env.live) {
        return;
      }

      // Checked before dialing.
      for (const overrides of [
        { foundryUrl: 'http://example.palantirfoundry.com' },
        { foundryUrl: 'https://example.palantirfoundry.com/api' },
        { foundryUrl: 'https://user:secret@example.palantirfoundry.com' },
        { token: Redacted.make('token with spaces') },
      ]) {
        const invalid = yield* reasonOf(Effect.scoped(connect(env, defaultModel, overrides)));
        expect(invalid._tag).toBe('InvalidUserInputError');
        expect(invalid.message).not.toMatch(/secret|token with spaces/u);
      }
      expect(env.sessions).toHaveLength(2);

      // Synthetic: an error event, which the session survives, then a 1011 close.
      yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connect(env, defaultModel);
          const error = yield* reasonOf(
            session.events.pipe(OpenAiRealtime.failOnError, Stream.runDrain),
          );
          expect(error).toMatchObject({
            _tag: 'InvalidRequestError',
            parameter: 'session.output_modalities',
            metadata: {
              'foundry-openai': { code: 'invalid_value', type: 'invalid_request_error' },
            },
          });
          // The stream continues where it stopped.
          const [delta] = yield* session.events.pipe(Stream.take(1), Stream.runCollect);
          expect(delta).toMatchObject({ type: 'response.output_text.delta', delta: 'partial' });
          expect(yield* reasonOf(Stream.runDrain(session.events))).toMatchObject({
            _tag: 'InternalProviderError',
          });
        }),
      );

      // Synthetic: a known event without its required field.
      yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connect(env, defaultModel);
          expect(yield* reasonOf(Stream.runDrain(session.events))).toMatchObject({
            _tag: 'InvalidResponseError',
          });
        }),
      );

      // Synthetic: the connection drops before `session.created`.
      expect(yield* reasonOf(Effect.scoped(connect(env, defaultModel)))).toMatchObject({
        _tag: 'NetworkError',
        reason: 'TransportError',
      });

      // Synthetic: unknown events and output items are skipped, and a 1000 close ends the stream.
      yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connect(env, defaultModel);
          const events = yield* Stream.runCollect(session.events);
          expect(events.map((event) => event.type)).toEqual(['session.created', 'response.done']);
          expect(events[1]).toMatchObject({
            response: { output: [{ type: 'function_call', name: 'missingTool' }] },
          });
        }),
      );

      // Synthetic: a call to a tool the toolkit lacks.
      yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connect(env, defaultModel);
          const withHandlers = yield* toolkit;
          const missing = yield* reasonOf(
            session.events.pipe(
              OpenAiRealtime.handleToolCalls(session, withHandlers),
              Stream.runDrain,
            ),
          );
          expect(missing).toMatchObject({ _tag: 'ToolNotFoundError', toolName: 'missingTool' });
        }),
      ).pipe(Effect.provide(handlers));
    }),
};
