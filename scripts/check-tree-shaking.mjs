// Proves @shpitdev/foundry-effect-ai tree-shakes per module. Installs the packed tarball beside
// effect in a scratch project, bundles each public module through the exports map (effect
// external), and fails when a bundle reaches code owned by another protocol or vendor, exceeds its
// size budget, when internal modules resolve, or when a consumer cannot typecheck each module and
// all of them together, with this package's metadata keys typed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const packageRoot = resolve('packages/foundry-effect-ai');
const distRoot = join(packageRoot, 'dist/src');

// Internal protocol folders and the public modules allowed to reach them.
const owners = {
  'src/internal/openai-responses/': ['OpenAiLanguageModel', 'XaiLanguageModel'],
  'src/internal/openai-chat-completions/': ['OpenAiChatLanguageModel'],
  'src/internal/openai-decisions/': ['OpenAiDecisionModel'],
  'src/internal/openai-embeddings/': ['OpenAiEmbeddingModel'],
  'src/internal/anthropic-messages/': ['AnthropicLanguageModel'],
  'src/internal/google-gemini/': ['GoogleLanguageModel'],
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
};

// Minified bytes with effect external. Set each module's real budget when its phase lands.
const budgets = {
  AnthropicLanguageModel: 25_000,
  FoundryClient: 6_800,
  GoogleLanguageModel: 21_000,
  OpenAiDecisionModel: 13_600,
  OpenAiEmbeddingModel: 8_400,
  OpenAiChatLanguageModel: 21_500,
  OpenAiLanguageModel: 26_700,
  XaiLanguageModel: 25_400,
  default: 64_000,
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
  // Every module together: one declaration per metadata key, typed for the consumer.
  writeFileSync(
    join(scratch, 'all.ts'),
    [
      "import type * as AiError from 'effect/ai/AiError';",
      "import type * as Response from 'effect/ai/Response';",
      ...modules.map((name) => `import * as ${name} from '@shpitdev/foundry-effect-ai/${name}';`),
      `export const modules = [${modules.join(', ')}];`,
      'export const reads = [',
      '  (metadata: AiError.RateLimitErrorMetadata): string | null | undefined => metadata.foundry?.errorName,',
      "  (metadata: Response.ToolCallPartMetadata): string | undefined => metadata['foundry-openai']?.itemId,",
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
    const budget = budgets[name] ?? budgets.default;
    if (bytes > budget) {
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

  // Consumers typecheck each module through the exports map with no other package installed.
  try {
    execFileSync(
      resolve('node_modules/.bin/tsc'),
      [
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        // Effect's recommended setting; without it, typed metadata keys conflict with Effect's
        // JSON index signatures unless the consumer skips library checks.
        '--exactOptionalPropertyTypes',
        '--skipLibCheck',
        'false',
        '--module',
        'nodenext',
        '--moduleResolution',
        'nodenext',
        '--target',
        'es2022',
        '--lib',
        'es2023,dom',
        ...modules.map((name) => `${name}.ts`),
        'all.ts',
      ],
      { cwd: scratch, encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (error) {
    failures.push(`Consumer typecheck failed:\n${error.stdout || error.message}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Tree-shaking check passed for ${modules.length} modules.`);
