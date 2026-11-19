import { Experimental_DecisionRefusalError, experimental_decide } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENAI_DECISION_MODEL_IDS, OPENAI_MODELS } from '../models/openai-models.js';
import { createFoundryOpenAI } from '../providers/openai.js';

const LUNA_RID = 'ri.language-model-service..language-model.gpt-6-luna';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const config = {
  foundryUrl: 'https://example.palantirfoundry.com/',
  token: 'token-123',
  attributionRid: 'ri.attribution.main',
  traceParent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
};
const usage = {
  input_tokens: 42,
  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
  output_tokens: 0,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 42,
};

function stubDecisions(answers: unknown[]) {
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      headers: request.headers,
      body: (await request.json()) as Record<string, unknown>,
    });
    return Response.json({ model: 'gpt-6-luna-dz', answers, usage });
  });
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Foundry OpenAI decisions', () => {
  it('lists only cataloged OpenAI models', () => {
    expect(OPENAI_DECISION_MODEL_IDS).toEqual(['gpt-6-luna']);
    for (const modelId of OPENAI_DECISION_MODEL_IDS) {
      expect(OPENAI_MODELS[modelId].rid).toBe(LUNA_RID);
    }
  });

  it('routes every question type to the proxy decisions endpoint by RID', async () => {
    const requests = stubDecisions([
      { type: 'predicate', name: 'damaged', probability: 0.97 },
      {
        type: 'choice',
        name: 'route',
        choice: 'shipping',
        confidence: 0.9,
        probabilities: [
          { value: 'billing', probability: 0.05 },
          { value: 'shipping', probability: 0.95 },
        ],
      },
      {
        type: 'score',
        name: 'urgency',
        score: 1.75,
        confidence: 0.8,
        probabilities: [
          { value: 0, label: '0', probability: 0 },
          { value: 1, label: '1', probability: 0.25 },
          { value: 2, label: '2', probability: 0.75 },
        ],
      },
    ]);
    const model = createFoundryOpenAI(config).decisionModel('gpt-6-luna');

    const result = await experimental_decide({
      model,
      state: 'My screen arrived cracked.',
      questions: {
        damaged: {
          type: 'boolean',
          instructions: 'Does the customer report damage?',
          criteria: { true: 'Physical damage is reported.' },
        },
        route: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: { billing: 'Payments and refunds.', shipping: null },
        },
        urgency: {
          type: 'score',
          instructions: 'How urgent is this?',
          criteria: ['Can wait.', null, 'Act now.'],
        },
      },
      providerOptions: { openai: { safetyIdentifier: 'user-hash' } },
      maxRetries: 0,
    });

    expect(model).toMatchObject({ modelId: 'gpt-6-luna', provider: 'foundry-openai.decision' });
    expect(result.answers).toEqual({
      damaged: { type: 'boolean', probability: 0.97 },
      route: {
        type: 'choice',
        choice: 'shipping',
        probabilities: { billing: 0.05, shipping: 0.95 },
      },
      urgency: { type: 'score', score: 1.75, probabilities: { 0: 0, 1: 0.25, 2: 0.75 } },
    });
    expect(result.usage).toMatchObject({ inputTokens: 42, outputTokens: 0 });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe(
      'https://example.palantirfoundry.com/api/v2/llm/proxy/openai/v1/decisions',
    );
    expect(request?.headers.get('authorization')).toBe('Bearer token-123');
    expect(request?.headers.get('attribution')).toBe(config.attributionRid);
    expect(request?.headers.get('traceparent')).toBe(config.traceParent);
    expect(request?.body).toEqual({
      model: LUNA_RID,
      safety_identifier: 'user-hash',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'My screen arrived cracked.' }] },
      ],
      questions: [
        {
          type: 'predicate',
          name: 'damaged',
          instructions:
            'Does the customer report damage?\n\nCriteria for true:\nPhysical damage is reported.',
        },
        {
          type: 'choice',
          name: 'route',
          instructions: 'Which team should handle this?',
          choices: [
            { value: 'billing', description: 'Payments and refunds.' },
            { value: 'shipping' },
          ],
        },
        {
          type: 'score',
          name: 'urgency',
          instructions: 'How urgent is this?',
          levels: [
            { label: '0', description: 'Can wait.' },
            { label: '1' },
            { label: '2', description: 'Act now.' },
          ],
        },
      ],
    });
  });

  it('sends JSON and image state as Decisions input parts', async () => {
    const requests = stubDecisions([{ type: 'predicate', name: 'photo', probability: 1 }]);
    const openai = createFoundryOpenAI(config);

    await experimental_decide({
      model: openai.decisionModel(LUNA_RID),
      state: [
        { type: 'json', value: { ticket: { id: 1234, priority: 'p2' } } },
        { type: 'file', mediaType: 'image/png', data: PNG },
      ],
      questions: { photo: { type: 'boolean', instructions: 'Is a photo attached?' } },
      maxRetries: 0,
    });

    expect(requests[0]?.body).toMatchObject({
      model: LUNA_RID,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_json', data: { ticket: { id: 1234, priority: 'p2' } } },
            { type: 'input_image', image_url: `data:image/png;base64,${PNG}` },
          ],
        },
      ],
    });
  });

  it('surfaces refusals as SDK refusal errors', async () => {
    stubDecisions([{ type: 'refusal', name: 'feasible' }]);

    await expect(
      experimental_decide({
        model: createFoundryOpenAI(config).decisionModel('gpt-6-luna'),
        state: 'Unsafe request.',
        questions: { feasible: { type: 'boolean', instructions: 'Would this work?' } },
        maxRetries: 0,
      }),
    ).rejects.toSatisfy(
      (error) =>
        Experimental_DecisionRefusalError.isInstance(error) &&
        error.questionIds.join() === 'feasible',
    );
  });

  it('rejects prompt cache keys before calling the proxy', async () => {
    const requests = stubDecisions([]);

    await expect(
      experimental_decide({
        model: createFoundryOpenAI(config).decisionModel('gpt-6-luna'),
        state: 'Text',
        questions: { ok: { type: 'boolean', instructions: 'Is it ok?' } },
        providerOptions: { openai: { promptCacheKey: 'tenant-1' } },
        maxRetries: 0,
      }),
    ).rejects.toThrow('the Foundry proxy rejects prompt_cache_key');
    expect(requests).toHaveLength(0);
  });
});
