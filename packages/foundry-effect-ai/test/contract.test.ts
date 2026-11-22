import { describe, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FakeFoundry from './FakeFoundry.ts';
import * as FakeSocket from './FakeSocket.ts';
import { expectGoldenRequests, expectGoldenSessions, loadCells, readFixtures } from './harness.ts';
import { rows } from './matrix.ts';

// Offline contract tests: each cell replays recorded Foundry fixtures through FakeFoundry (HTTP)
// and FakeSocket (realtime) and asserts the decoded result; requests and client frames must
// match those recorded with the fixtures.
for (const { module, phase, cells } of rows) {
  const implemented = (await loadCells(module))?.cells;
  describe(`${module} (phase ${phase})`, () => {
    for (const cell of cells.filter((name) => implemented?.[name] === undefined)) {
      it.todo(cell);
    }
    for (const [cell, run] of Object.entries(implemented ?? {}).filter(([name]) =>
      cells.includes(name),
    )) {
      it.effect(cell, () => {
        const fixtures = readFixtures(module, cell);
        const exchanges = fixtures.filter(
          (fixture): fixture is FakeFoundry.Fixture => !FakeSocket.isSocketFixture(fixture),
        );
        const sockets = fixtures.filter(FakeSocket.isSocketFixture);
        const fake = FakeFoundry.replay(...exchanges);
        const socket = FakeSocket.replay(...sockets);
        return run({
          live: false,
          client: fake.client,
          requests: fake.requests,
          settings: FakeFoundry.options,
          sockets: socket.layer,
          sessions: socket.sessions,
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              expectGoldenRequests(exchanges, fake.requests);
              expectGoldenSessions(sockets, socket.sessions);
            }),
          ),
        );
      });
    }
  });
}
