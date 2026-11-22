/**
 * Splits content that carries `<reasoning>…</reasoning>` spans into reasoning and text. DeepSeek,
 * Nemotron and Qwen send their reasoning this way on Foundry's Chat route: often one span per
 * stream delta, and a tag may be split across deltas, so a suffix that could start a tag waits
 * for the next piece. Whitespace between spans and before the answer is the chat template's
 * separator, not output, so text right after a span starts at its first non-blank character.
 */
const tags = { open: '<reasoning>', close: '</reasoning>' } as const;

export interface Segment {
  readonly type: 'reasoning' | 'text';
  readonly text: string;
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

/** A stateful splitter: `push` each content piece in order, then `flush` at the end. */
export const makeSplitter = () => {
  let inside = false;
  let pending = '';
  let afterReasoning = false;

  const emit = (segments: Array<Segment>, text: string) => {
    if (inside) {
      if (text !== '') {
        afterReasoning = true;
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
    push: (piece: string): ReadonlyArray<Segment> => {
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
        inside = !inside;
      }
      return segments;
    },
    /** What a partial tag held back; an unclosed span stays reasoning. */
    flush: (): ReadonlyArray<Segment> => {
      const segments: Array<Segment> = [];
      emit(segments, pending);
      pending = '';
      return segments;
    },
  };
};

/** Splits a whole message's content, joining neighbouring spans into one segment. */
export const split = (content: string): ReadonlyArray<Segment> => {
  const splitter = makeSplitter();
  const segments: Array<Segment> = [];
  for (const segment of [...splitter.push(content), ...splitter.flush()]) {
    const last = segments.at(-1);
    if (last?.type === segment.type) {
      segments[segments.length - 1] = { type: last.type, text: last.text + segment.text };
    } else {
      segments.push(segment);
    }
  }
  return segments;
};
