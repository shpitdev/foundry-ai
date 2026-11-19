import { loadFoundryConfig, REALTIME_MODEL_IDS, type RealtimeModelId } from '@shpitdev/foundry-ai';
import { createFoundryRealtime, createFoundryRealtimeSetup } from '@shpitdev/foundry-ai/realtime';

const config = loadFoundryConfig();
const isRealtimeModelId = (id: string): id is RealtimeModelId =>
  (REALTIME_MODEL_IDS as ReadonlyArray<string>).includes(id);
const modelId = process.argv[2] ?? 'gpt-realtime-2.1';
if (!isRealtimeModelId(modelId)) {
  throw new Error(`Choose a realtime model: ${REALTIME_MODEL_IDS.join(', ')}`);
}
const model = createFoundryRealtime(config)(modelId);
const setup = createFoundryRealtimeSetup({ ...config, model: modelId });
const connection = model.getWebSocketConfig(setup);
const ws = new WebSocket(connection.url, connection.protocols);
const send: (event: Parameters<typeof model.serializeClientEvent>[0]) => void = (event) => {
  ws.send(JSON.stringify(model.serializeClientEvent(event)));
};
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    ws.close();
    reject(new Error('Realtime response timed out'));
  }, 30_000);
  const finish = (error?: Error) => {
    clearTimeout(timeout);
    ws.close(1000);
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  };
  ws.addEventListener('error', () => {
    finish(new Error('Foundry realtime connection failed'));
  });
  ws.addEventListener('close', (event) => {
    if (event.code !== 1000) {
      finish(new Error(`Realtime closed: ${event.code}`));
    }
  });
  ws.addEventListener('message', (message) => {
    const parsed = model.parseServerEvent(JSON.parse(String(message.data)));
    for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
      if (event.type === 'session-created') {
        send({
          type: 'session-update',
          config: { outputModalities: ['text'], turnDetection: { type: 'disabled' } },
        });
      }
      if (event.type === 'session-updated') {
        send({
          type: 'conversation-item-create',
          item: { type: 'text-message', role: 'user', text: 'Reply with READY.' },
        });
        send({ type: 'response-create', options: { modalities: ['text'] } });
      }
      if (event.type === 'text-delta') {
        process.stdout.write(event.delta);
      }
      if (event.type === 'response-done') {
        process.stdout.write('\n');
        finish(event.status === 'completed' ? undefined : new Error(`Response ${event.status}`));
      }
      if (event.type === 'error') {
        finish(new Error('Foundry realtime returned an error'));
      }
    }
  });
});
