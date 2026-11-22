import { isRecord } from '../records.js';

// Foundry omits fields required by the native xAI response schema. Keep these
// adaptations at the wire boundary; the native SDK owns content/stream parsing.
export function createXaiProxyFetch(): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body: unknown = await request.json();
    if (isRecord(body) && Array.isArray(body.input)) {
      body.input = body.input.map((item: unknown) => {
        if (!isRecord(item) || item.role !== 'assistant') {
          return item;
        }
        // Native xAI already serializes plain assistant text, but Foundry rejects
        // its optional message id. Tool-call and reasoning ids must be preserved.
        const { id: _id, ...message } = item;
        return message;
      });
    }
    const response = await fetch(
      new Request(request, { method: request.method, body: JSON.stringify(body) }),
    );
    if (!response.ok) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    const responseInit = { status: response.status, statusText: response.statusText, headers };
    if (isRecord(body) && body.stream === true && response.body !== null) {
      return new Response(
        response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(normalizeEventStream())
          .pipeThrough(new TextEncoderStream()),
        responseInit,
      );
    }
    return new Response(JSON.stringify(normalizeResponse(await response.json())), responseInit);
  };
}

function normalizeResponse(value: unknown, initial = false): unknown {
  if (!isRecord(value)) {
    return value;
  }
  // Supply only omitted schema fields; leave explicit invalid values to the SDK.
  if (value.object === undefined) {
    value.object = 'response';
  }
  if (initial && value.output === undefined) {
    value.output = [];
  }
  return value;
}

function normalizeEventStream(): TransformStream<string, string> {
  let pending = '';
  return new TransformStream({
    transform(chunk, controller) {
      pending += chunk;
      let boundary = /\r\n\r\n|\n\n|\r\r/u.exec(pending);
      while (boundary !== null) {
        const event = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        controller.enqueue(`${normalizeEvent(event)}\n\n`);
        boundary = /\r\n\r\n|\n\n|\r\r/u.exec(pending);
      }
    },
    flush(controller) {
      if (pending) {
        controller.enqueue(normalizeEvent(pending));
      }
    },
  });
}

function normalizeEvent(event: string): string {
  const lines = event.split(/\r\n|\r|\n/u);
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return event;
  }
  if (!isRecord(value)) {
    return event;
  }
  if (
    !['response.created', 'response.in_progress', 'response.completed', 'response.done'].includes(
      String(value.type),
    )
  ) {
    return event;
  }
  normalizeResponse(
    value.response,
    value.type === 'response.created' || value.type === 'response.in_progress',
  );
  return [
    ...lines.filter((line) => !line.startsWith('data:')),
    `data: ${JSON.stringify(value)}`,
  ].join('\n');
}
