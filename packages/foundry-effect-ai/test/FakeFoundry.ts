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
  readonly body: string;
}

export interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * A FoundryClient over an HttpClient that answers each request with the next fixture and
 * records what was sent, so tests assert the golden request and the decoded result.
 */
export const replay = (...fixtures: ReadonlyArray<Fixture>) => {
  const requests: Array<CapturedRequest> = [];
  const client = HttpClient.make((request, url) => {
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
          headers: { 'content-type': fixture.contentType },
        }),
      ),
    );
  });
  const layer = FoundryClient.layer(options).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  );
  return { requests, layer } as const;
};

const decodeJson = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));
