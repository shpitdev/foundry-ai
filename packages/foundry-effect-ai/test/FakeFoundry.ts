import * as Effect from 'effect/Effect';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as FoundryClient from '../src/FoundryClient.ts';

export const options = {
  foundryUrl: 'https://example.palantirfoundry.com/',
  token: Redacted.make('token-123'),
  attributionRid: 'ri.attribution.main',
  traceParent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
} satisfies FoundryClient.Options;

export interface Fixture {
  readonly status?: number;
  /** `application/json` or `text/event-stream`. */
  readonly contentType: string;
  /** Synthetic fixtures only: recordings keep status, content type and body. */
  readonly headers?: Readonly<Record<string, string>>;
  /** `null` for bodyless responses such as 204. */
  readonly body: string | null;
}

export interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * An HttpClient that answers each request with the next fixture and records what was sent, so
 * tests assert the golden request and the decoded result. `client` builds a FoundryClient over
 * it from `options` and any overrides.
 */
export const replay = (...fixtures: ReadonlyArray<Fixture>) => {
  const requests: Array<CapturedRequest> = [];
  const http = HttpClient.make((request, url) => {
    const fixture = fixtures[requests.length];
    requests.push({
      method: request.method,
      url: url.toString(),
      headers: request.headers,
      body: request.body._tag === 'Uint8Array' ? decodeJson(request.body.body) : undefined,
    });
    if (fixture === undefined) {
      return Effect.die(`FakeFoundry has no fixture for request ${requests.length}: ${url}`);
    }
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(fixture.body, {
          status: fixture.status ?? 200,
          headers: { ...fixture.headers, 'content-type': fixture.contentType },
        }),
      ),
    );
  });
  const client = (overrides?: Partial<FoundryClient.Options>) =>
    FoundryClient.layer({ ...options, ...overrides }).pipe(
      Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
    );
  return { requests, client } as const;
};

const decodeJson = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));
