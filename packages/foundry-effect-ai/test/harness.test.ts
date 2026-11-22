import { describe, expect, it } from '@effect/vitest';
import { scrubber } from './harness.ts';

// Regression: realtime IDs went unscrubbed, and an ID first seen under a key the scrubber did not
// know kept its live value there.
describe('scrubber', () => {
  it('gives each ID one placeholder across the cell', () => {
    const texts = [
      '{"note":"conv_9f8e7d6c5b","item_id":"item_1a2b3c4d5e"}',
      '{"event_id":"event_0a1b2c3d4e","conversation_id":"conv_9f8e7d6c5b","call_id":"call_abcdef12"}',
      '{"url":"wss://stack.example.com/x","auth":"Bearer live-token-1"}',
    ];
    const scrub = scrubber({ host: 'stack.example.com', token: 'live-token-1' }, texts);
    expect(texts.map(scrub)).toEqual([
      '{"note":"redacted-id-3","item_id":"redacted-id-1"}',
      '{"event_id":"redacted-id-2","conversation_id":"redacted-id-3","call_id":"redacted-id-4"}',
      '{"url":"wss://example.palantirfoundry.com/x","auth":"Bearer redacted-token"}',
    ]);
  });
});
