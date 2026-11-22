/**
 * WebSocket fixtures for realtime cells. A fixture is one socket session: the URL dialed and the
 * frames in the order the client saw them. `replay` hands out recorded sessions in order as a
 * `WebSocketConstructor`; `record` wraps the global WebSocket and captures live sessions.
 */
import * as Layer from 'effect/Layer';
import * as Socket from 'effect/socket/Socket';

export type Frame = { readonly sent: unknown } | { readonly received: unknown };

export interface SocketFixture {
  /** The URL dialed; recordings replace the stack host. */
  readonly url: string;
  readonly frames: ReadonlyArray<Frame>;
  /** Set when Foundry closed the session; a session the client closed has none. */
  readonly close?: { readonly code: number; readonly reason: string };
}

export const isSocketFixture = (fixture: unknown): fixture is SocketFixture =>
  typeof fixture === 'object' && fixture !== null && 'frames' in fixture;

/** A session as the client opened it during a replay. */
export interface CapturedSession {
  readonly url: string;
  readonly protocols: unknown;
  readonly sent: Array<unknown>;
  /** The code the client closed with; unset while open or when Foundry closed first. */
  closedByClient?: number;
}

type Listener = (event: Socket.WebSocketEvent) => void;
type EventType = 'open' | 'message' | 'error' | 'close';

/**
 * Plays one recorded session: opens, emits received frames up to the next recorded send, and
 * waits for the client to send before going on. After the last frame it closes as Foundry did,
 * or waits for the client to close.
 */
class ReplayingSocket implements Socket.WebSocketLike {
  readyState = 0;
  private readonly listeners = new Map<EventType, Set<Listener>>();
  private cursor = 0;
  // Client frames not yet matched to a recorded send.
  private credits = 0;

  private readonly fixture: SocketFixture;
  private readonly captured: CapturedSession;

  constructor(fixture: SocketFixture, captured: CapturedSession) {
    this.fixture = fixture;
    this.captured = captured;
    queueMicrotask(() => {
      if (this.readyState === 0) {
        this.readyState = 1;
        this.emit('open', {});
        this.pump();
      }
    });
  }

  addEventListener(type: EventType, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: EventType, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string | Uint8Array<ArrayBuffer>): void {
    if (this.readyState !== 1) {
      return;
    }
    this.captured.sent.push(JSON.parse(String(data)));
    this.credits += 1;
    queueMicrotask(() => {
      this.pump();
    });
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState !== 3) {
      this.captured.closedByClient = code;
      this.finish(code, reason);
    }
  }

  private finish(code: number, reason: string): void {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  private emit(type: EventType, event: Socket.WebSocketEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  private pump(): void {
    while (this.readyState === 1 && this.cursor < this.fixture.frames.length) {
      const frame = this.fixture.frames[this.cursor];
      if (frame === undefined) {
        return;
      }
      if ('sent' in frame) {
        if (this.credits === 0) {
          return;
        }
        this.credits -= 1;
        this.cursor += 1;
        continue;
      }
      this.cursor += 1;
      this.emit('message', { data: JSON.stringify(frame.received) });
    }
    if (this.readyState === 1 && this.fixture.close !== undefined) {
      this.finish(this.fixture.close.code, this.fixture.close.reason);
    }
  }
}

/** Replays `fixtures` one per dialed socket, capturing what the client sent. */
export const replay = (...fixtures: ReadonlyArray<SocketFixture>) => {
  const sessions: Array<CapturedSession> = [];
  const layer = Layer.succeed(Socket.WebSocketConstructor, (url, protocols) => {
    const fixture = fixtures[sessions.length];
    const captured: CapturedSession = { url, protocols, sent: [] };
    sessions.push(captured);
    if (fixture === undefined) {
      throw new Error(`FakeSocket has no fixture for socket ${sessions.length}: ${url}`);
    }
    return new ReplayingSocket(fixture, captured);
  });
  return { layer, sessions } as const;
};

/**
 * The global WebSocket, recording each session's URL and frames. A close the client did not ask
 * for is kept, so the replay closes the same way.
 */
export const record = () => {
  const sessions: Array<{ url: string; frames: Array<Frame>; close?: SocketFixture['close'] }> = [];
  const layer = Layer.succeed(Socket.WebSocketConstructor, (url, protocols) => {
    const ws = new globalThis.WebSocket(url, protocols as string | Array<string>);
    const session: (typeof sessions)[number] = { url, frames: [] };
    sessions.push(session);
    let closing = false;
    ws.addEventListener('message', (event) => {
      session.frames.push({ received: JSON.parse(String(event.data)) });
    });
    ws.addEventListener('close', (event) => {
      if (!closing) {
        session.close = { code: event.code, reason: event.reason };
      }
    });
    return {
      get readyState() {
        return ws.readyState;
      },
      addEventListener: (type, listener, options) => {
        ws.addEventListener(type, listener as (event: Event) => void, options);
      },
      removeEventListener: (type, listener) => {
        ws.removeEventListener(type, listener as (event: Event) => void);
      },
      send: (data) => {
        session.frames.push({ sent: JSON.parse(String(data)) });
        ws.send(data);
      },
      close: (code, reason) => {
        closing = true;
        ws.close(code, reason);
      },
    } satisfies Socket.WebSocketLike;
  });
  return { layer, sessions } as const;
};
