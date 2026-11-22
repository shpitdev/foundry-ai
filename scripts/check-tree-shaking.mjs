// Proves @shpitdev/foundry-effect-ai tree-shakes per module. Installs the packed tarball beside
// effect in a scratch project, bundles each public module through the exports map (effect
// external), and fails when a bundle reaches code owned by another protocol or vendor, exceeds its
// size budget, when internal modules resolve, or when a consumer cannot typecheck each module and
// all of them together, in both `exactOptionalPropertyTypes` modes, with the metadata keys typed
// in exact mode.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const packageRoot = resolve('packages/foundry-effect-ai');
const distRoot = join(packageRoot, 'dist/src');

// Internal protocol folders and the public modules allowed to reach them.
const owners = {
  'src/internal/openai-responses/': [
    'OpenAiLanguageModel',
    'XaiLanguageModel',
    'GemmaLanguageModel',
  ],
  'src/internal/openai-chat-completions/': [
    'OpenAiChatLanguageModel',
    'DeepSeekLanguageModel',
    'NvidiaLanguageModel',
    'QwenLanguageModel',
    'MoonshotLanguageModel',
  ],
  // The `<reasoning>` tag parser, passed in only by the makers that send tagged reasoning.
  'src/internal/openai-chat-completions/reasoningTags.js': [
    'DeepSeekLanguageModel',
    'NvidiaLanguageModel',
    'QwenLanguageModel',
  ],
  'src/internal/openai-decisions/': ['OpenAiDecisionModel'],
  'src/internal/openai-embeddings/': ['OpenAiEmbeddingModel'],
  'src/internal/anthropic-messages/': ['AnthropicLanguageModel'],
  'src/internal/google-gemini/': ['GoogleLanguageModel'],
  'src/internal/openai-realtime/': ['OpenAiRealtime'],
  // Per-vendor model lists.
  'src/internal/models/openai.js': [
    'OpenAiLanguageModel',
    'OpenAiChatLanguageModel',
    'OpenAiDecisionModel',
    'OpenAiEmbeddingModel',
  ],
  'src/internal/models/anthropic.js': ['AnthropicLanguageModel'],
  'src/internal/models/google.js': ['GoogleLanguageModel'],
  'src/internal/models/xai.js': ['XaiLanguageModel'],
  'src/internal/models/deepseek.js': ['DeepSeekLanguageModel'],
  'src/internal/models/nvidia.js': ['NvidiaLanguageModel'],
  'src/internal/models/qwen.js': ['QwenLanguageModel'],
  'src/internal/models/moonshot.js': ['MoonshotLanguageModel'],
  'src/internal/models/gemma.js': ['GemmaLanguageModel'],
  'src/internal/models/realtime.js': ['OpenAiRealtime'],
};

// Minified bytes with effect external: each module's measured size plus about 20%, re-measured
// in phase 8; the phase 10 modules were measured when added. A new module needs its own line.
const budgets = {
  AnthropicLanguageModel: 25_500,
  DeepSeekLanguageModel: 21_200,
  FoundryClient: 6_800,
  GemmaLanguageModel: 25_000,
  GoogleLanguageModel: 21_000,
  MoonshotLanguageModel: 21_400,
  NvidiaLanguageModel: 21_500,
  OpenAiChatLanguageModel: 21_700,
  OpenAiDecisionModel: 13_700,
  OpenAiEmbeddingModel: 8_300,
  OpenAiLanguageModel: 27_400,
  OpenAiRealtime: 12_600,
  QwenLanguageModel: 21_300,
  XaiLanguageModel: 25_400,
};

const modules = readdirSync(distRoot)
  .filter((file) => file.endsWith('.js'))
  .map((file) => file.slice(0, -'.js'.length))
  .toSorted();
if (modules.length === 0) {
  throw new Error(`No public modules in ${distRoot}; run the build first.`);
}

const scratch = mkdtempSync(join(tmpdir(), 'foundry-effect-ai-tree-shaking-'));
const failures = [];
try {
  // A real copy of the published files, so nothing resolves from the workspace behind a symlink.
  const installed = join(scratch, 'node_modules/@shpitdev/foundry-effect-ai');
  mkdirSync(installed, { recursive: true });
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], {
      cwd: packageRoot,
      encoding: 'utf8',
    }),
  );
  execFileSync('tar', [
    '-xzf',
    join(scratch, packed.filename),
    '-C',
    installed,
    '--strip-components=1',
  ]);
  symlinkSync(resolve('node_modules/effect'), join(scratch, 'node_modules/effect'), 'dir');
  writeFileSync(join(scratch, 'package.json'), '{"type":"module"}\n');

  // A namespace export keeps the module's whole public surface: the worst case for size.
  for (const name of modules) {
    writeFileSync(
      join(scratch, `${name}.ts`),
      `export * as M from '@shpitdev/foundry-effect-ai/${name}';\n`,
    );
  }
  // Every module together, which needs one declaration per metadata key; `typed.ts` also reads
  // the keys, which are typed under `exactOptionalPropertyTypes` only.
  const imports = modules.map(
    (name) => `import * as ${name} from '@shpitdev/foundry-effect-ai/${name}';`,
  );
  writeFileSync(
    join(scratch, 'all.ts'),
    [...imports, `export const modules = [${modules.join(', ')}];`, ''].join('\n'),
  );
  writeFileSync(
    join(scratch, 'typed.ts'),
    [
      "import type * as AiError from 'effect/ai/AiError';",
      "import type * as Response from 'effect/ai/Response';",
      "import './all.ts';",
      'export const reads = [',
      '  (metadata: AiError.RateLimitErrorMetadata): string | null | undefined => metadata.foundry?.errorName,',
      '  (metadata: AiError.UnknownErrorMetadata): string | null | undefined => metadata.foundry?.errorName,',
      "  (metadata: Response.ToolCallPartMetadata): string | undefined => metadata['foundry-openai']?.itemId,",
      "  (metadata: Response.FinishPartMetadata): string | undefined => metadata['foundry-moonshot']?.refusal,",
      '];',
      '',
    ].join('\n'),
  );
  const bundles = await Promise.all(
    modules.map((name) =>
      build({
        absWorkingDir: scratch,
        entryPoints: [`${name}.ts`],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        minify: true,
        metafile: true,
        write: false,
        external: ['effect', 'effect/*'],
        logLevel: 'silent',
      }).then((result) => ({ name, result })),
    ),
  );
  for (const { name, result } of bundles) {
    const bytes = result.outputFiles[0]?.contents.byteLength ?? 0;
    const budget = budgets[name];
    if (budget === undefined) {
      failures.push(`${name}: no size budget; add one to scripts/check-tree-shaking.mjs.`);
    } else if (bytes > budget) {
      failures.push(`${name}: ${bytes} bytes exceeds its ${budget}-byte budget.`);
    }
    for (const input of Object.keys(result.metafile.inputs).map((path) =>
      relative(packageRoot, resolve(scratch, path)),
    )) {
      for (const [owned, allowed] of Object.entries(owners)) {
        if (input.includes(owned) && !allowed.includes(name)) {
          failures.push(
            `${name} bundles ${input}, which belongs to ${allowed.join(', ') || 'no Effect module'}.`,
          );
        }
      }
      const publicModule = /\/src\/([A-Z]\w+)\.js$/u.exec(input)?.[1];
      if (publicModule && publicModule !== name && publicModule !== 'FoundryClient') {
        failures.push(`${name} bundles the public module ${publicModule}.`);
      }
    }
    console.log(`${name}: ${bytes} bytes`);
  }

  // No built internal module may resolve through the exports map.
  const internalModules = readdirSync(join(distRoot, 'internal'), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.js'))
    .map((file) => `@shpitdev/foundry-effect-ai/internal/${file.slice(0, -'.js'.length)}`);
  const resolvedInternals = await Promise.all(
    internalModules.map((specifier) =>
      build({
        absWorkingDir: scratch,
        stdin: { contents: `import '${specifier}';`, resolveDir: scratch },
        bundle: true,
        write: false,
        external: ['effect', 'effect/*'],
        logLevel: 'silent',
      }).then(
        () => [specifier],
        () => [],
      ),
    ),
  );
  for (const specifier of resolvedInternals.flat()) {
    failures.push(`${specifier} resolved; the exports map must block internal modules.`);
  }

  // Consumers typecheck each module through the exports map with no other package installed,
  // with and without `exactOptionalPropertyTypes`.
  const typecheck = (flags, files) => {
    try {
      execFileSync(
        resolve('node_modules/.bin/tsc'),
        [
          '--ignoreConfig',
          '--noEmit',
          '--strict',
          ...flags,
          '--skipLibCheck',
          'false',
          '--allowImportingTsExtensions',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '--target',
          'es2022',
          '--lib',
          'es2023,dom',
          ...modules.map((name) => `${name}.ts`),
          ...files,
        ],
        { cwd: scratch, encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (error) {
      failures.push(
        `Consumer typecheck failed (${flags.join(' ') || 'strict'}):\n${error.stdout || error.message}`,
      );
    }
  };
  typecheck([], ['all.ts']);
  typecheck(['--exactOptionalPropertyTypes'], ['all.ts', 'typed.ts']);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Tree-shaking check passed for ${modules.length} modules.`);
