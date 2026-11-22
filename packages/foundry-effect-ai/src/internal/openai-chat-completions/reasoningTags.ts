/**
 * Splits content that carries `<reasoning>…</reasoning>` spans into reasoning and text. DeepSeek,
 * Nemotron and Qwen send their reasoning this way on Foundry's Chat route when asked to reason:
 * often one span per stream delta, and a tag may be split across deltas, so a suffix that could
 * start a tag waits for the next piece. Whitespace between spans and before the answer is the
 * chat template's separator, not output, so text after a closing tag starts at its first
 * non-blank character, even when the span was empty.
 *
 * Only the makers that send spans pass `makeSplitter` in their dialect, so other bundles never
 * include this file; the shared decoders import its types alone.
 */
const tags = { open: '<reasoning>', close: '</reasoning>' } as const;

export interface Segment {
  readonly type: 'reasoning' | 'text';
  readonly text: string;
}

export interface Splitter {
  /** Splits the next content piece, in order. */
  readonly push: (piece: string) => ReadonlyArray<Segment>;
  /** What a partial tag held back; an unclosed span stays reasoning. */
  readonly flush: () => ReadonlyArray<Segment>;
}

/** The length of the longest end of `text` that is a proper start of `tag`. */
const partialTag = (text: string, tag: string): number => {
  for (let length = Math.min(text.length, tag.length - 1); length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) {
      return length;
    }
  }
  return 0;
};

/** A stateful splitter for one message's content. */
export const makeSplitter = (): Splitter => {
  let inside = false;
  let pending = '';
  // A closing tag came last, so separator whitespace is still to be dropped.
  let afterReasoning = false;

  const emit = (segments: Array<Segment>, text: string) => {
    if (inside) {
      if (text !== '') {
        segments.push({ type: 'reasoning', text });
      }
      return;
    }
    const answer = afterReasoning ? text.trimStart() : text;
    if (answer !== '') {
      afterReasoning = false;
      segments.push({ type: 'text', text: answer });
    }
  };

  return {
    push: (piece) => {
      const segments: Array<Segment> = [];
      let buffer = pending + piece;
      pending = '';
      while (buffer !== '') {
        const tag = inside ? tags.close : tags.open;
        const at = buffer.indexOf(tag);
        if (at === -1) {
          const keep = partialTag(buffer, tag);
          emit(segments, buffer.slice(0, buffer.length - keep));
          pending = buffer.slice(buffer.length - keep);
          break;
        }
        emit(segments, buffer.slice(0, at));
        buffer = buffer.slice(at + tag.length);
        afterReasoning ||= inside;
        inside = !inside;
      }
      return segments;
    },
    flush: () => {
      const segments: Array<Segment> = [];
      emit(segments, pending);
      pending = '';
      return segments;
    },
  };
};
