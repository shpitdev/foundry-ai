import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Experimental_RealtimeClientEvent, Experimental_RealtimeServerEvent } from 'ai';
import { afterAll, expect, it } from 'vitest';
import { REALTIME_MODEL_IDS } from '../models/realtime-models.js';
import { createFoundryRealtime, createFoundryRealtimeSetup } from '../providers/realtime.js';
import { loadLiveFoundryConfig } from './helpers/live-foundry.js';

const require = createRequire(import.meta.url);
const sdk = {
  ai: require('ai/package.json').version,
  '@ai-sdk/openai': require('@ai-sdk/openai/package.json').version,
};
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const startedAt = new Date().toISOString();
let finishedAt: string | undefined;
const config = loadLiveFoundryConfig();
const factory = createFoundryRealtime(config);
const results: Array<Record<string, unknown>> = [];
const artifactDir = resolve(
  import.meta.dirname,
  '../../../../.memory/realtime-runs',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(artifactDir, { recursive: true });
const writeResults = () =>
  writeFileSync(
    resolve(artifactDir, 'results.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        startedAt,
        finishedAt,
        sdk,
        gitSha,
        scope:
          'Live Foundry WebSocket through AI SDK 7 event serializer/parser; generated audio only. No browser microphone or speaker playback verification.',
        results,
      },
      null,
      2,
    ),
  );
afterAll(() => {
  finishedAt = new Date().toISOString();
  writeResults();
});

for (const modelId of REALTIME_MODEL_IDS) {
  it(`${modelId}: realtime text, tools, audio output and audio input`, async () => {
    const model = factory(modelId);
    const setup = createFoundryRealtimeSetup({ ...config, model: modelId });
    const connection = model.getWebSocketConfig(setup);
    const socket = new WebSocket(connection.url, connection.protocols);
    const events: Experimental_RealtimeServerEvent[] = [];
    let failure: Error | undefined;
    socket.onmessage = (message) => {
      try {
        const parsed = model.parseServerEvent(JSON.parse(String(message.data)));
        for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
          events.push(event);
          if (event.type === 'error') failure = new Error(JSON.stringify(event));
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    };
    socket.onerror = () => {
      failure = new Error('Foundry realtime WebSocket connection failed');
    };
    socket.onclose = (event) => {
      if (event.code !== 1000) failure = new Error(`WebSocket closed: ${event.code}`);
    };
    const send = (event: Experimental_RealtimeClientEvent) =>
      socket.send(JSON.stringify(model.serializeClientEvent(event)));
    const waitFor = async (type: Experimental_RealtimeServerEvent['type'], start = 0) => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (failure) throw failure;
        const found = events.slice(start).find((event) => event.type === type);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };
    const response = async (text: string, modalities: string[]) => {
      const start = events.length;
      send({
        type: 'conversation-item-create',
        item: { type: 'text-message', role: 'user', text },
      });
      send({ type: 'response-create', options: { modalities } });
      const done = await waitFor('response-done', start);
      expect(done).toMatchObject({ status: 'completed' });
      return events.slice(start);
    };
    const textOf = (items: Experimental_RealtimeServerEvent[]) =>
      items.map((event) => (event.type === 'text-delta' ? event.delta : '')).join('');
    let capability = 'connection';
    try {
      await waitFor('session-created');
      send({
        type: 'session-update',
        config: {
          outputModalities: ['text'],
          turnDetection: { type: 'disabled' },
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        },
      });
      await waitFor('session-updated');
      results.push({ modelId, capability, status: 'pass' });
      capability = 'text';
      const text = textOf(await response('Reply with READY.', ['text']));
      expect(text).toContain('READY');
      results.push({ modelId, capability, status: 'pass', text });
      capability = 'tools';
      let start = events.length;
      send({
        type: 'session-update',
        config: {
          tools: [
            {
              type: 'function',
              name: 'lookupCode',
              description: 'Look up the secret verification code.',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          ],
        },
      });
      await waitFor('session-updated', start);
      const toolEvents = await response(
        'Call lookupCode exactly once, then reply with the exact code returned by the tool.',
        ['text'],
      );
      const call = toolEvents.find((event) => event.type === 'function-call-arguments-done');
      expect(call?.type).toBe('function-call-arguments-done');
      if (call?.type !== 'function-call-arguments-done') throw new Error('No tool call');
      expect(call.name).toBe('lookupCode');
      const code = `VERIFIED_${Math.random().toString(36).slice(2, 10)}`;
      start = events.length;
      send({
        type: 'conversation-item-create',
        item: {
          type: 'function-call-output',
          callId: call.callId,
          output: JSON.stringify({ code }),
        },
      });
      send({ type: 'response-create', options: { modalities: ['text'] } });
      expect(await waitFor('response-done', start)).toMatchObject({ status: 'completed' });
      expect(textOf(events.slice(start))).toContain(code);
      results.push({ modelId, capability, status: 'pass', toolExecuted: true });
      capability = 'audio-output';
      const audioEvents = await response(
        'Read this ordinary sentence aloud exactly: The garden contains a sunflower.',
        ['audio'],
      );
      const transcript = audioEvents
        .map((event) => (event.type === 'audio-transcript-delta' ? event.delta : ''))
        .join('');
      const audio = Buffer.concat(
        audioEvents.flatMap((event) =>
          event.type === 'audio-delta' ? [Buffer.from(event.delta, 'base64')] : [],
        ),
      );
      expect(audio.length).toBeGreaterThan(4800);
      expect(audio.some((value) => value !== 0)).toBe(true);
      writeFileSync(resolve(artifactDir, `${modelId}.pcm`), audio);
      results.push({
        modelId,
        capability,
        status: 'pass',
        pcmBytes: audio.length,
        sampleRate: 24000,
        transcript,
      });
      capability = 'audio-fixture';
      expect(transcript.toLowerCase()).toContain('sunflower');
      capability = 'audio-input';
      // A new session avoids answering from the text history that generated the audio.
      socket.close(1000);
      const inputSocket = new WebSocket(connection.url, connection.protocols);
      events.length = 0;
      inputSocket.onmessage = socket.onmessage;
      inputSocket.onerror = socket.onerror;
      inputSocket.onclose = socket.onclose;
      const sendInput = (event: Experimental_RealtimeClientEvent) =>
        inputSocket.send(JSON.stringify(model.serializeClientEvent(event)));
      try {
        await waitFor('session-created');
        sendInput({
          type: 'session-update',
          config: {
            instructions: 'Repeat the words you hear in the audio.',
            outputModalities: ['text'],
            turnDetection: { type: 'disabled' },
            inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          },
        });
        await waitFor('session-updated');
        start = events.length;
        sendInput({ type: 'input-audio-append', audio: audio.toString('base64') });
        sendInput({ type: 'input-audio-commit' });
        await waitFor('audio-committed', start);
        sendInput({ type: 'response-create', options: { modalities: ['text'] } });
        expect(await waitFor('response-done', start)).toMatchObject({ status: 'completed' });
        const heard = textOf(events.slice(start));
        results.push({ modelId, capability: 'audio-input-observation', text: heard });
        expect(heard.toLowerCase()).toContain('sunflower');
        results.push({ modelId, capability, status: 'pass', text: heard });
      } finally {
        inputSocket.close(1000);
      }
    } catch (error) {
      results.push({
        modelId,
        capability,
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      socket.close(1000);
      writeResults();
    }
  });
}
