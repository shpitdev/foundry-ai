// Proves @nyrra/foundry-effect-ai tree-shakes per module: bundles each public module through the
// package exports map (effect external) and fails when a bundle reaches code owned by another
// protocol or vendor, exceeds its size budget, or when a consumer cannot typecheck the module.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const packageRoot = resolve('packages/foundry-effect-ai');
const distRoot = join(packageRoot, 'dist/foundry-effect-ai/src');

// Internal protocol folders and the public modules allowed to reach them.
const owners = {
  'src/internal/responses/': ['OpenAiLanguageModel', 'XaiLanguageModel'],
  'src/internal/chat/': ['OpenAiChatLanguageModel', 'XaiLanguageModel'],
  'src/internal/decisions/': ['OpenAiDecisionModel'],
  'src/internal/embeddings/': ['OpenAiEmbeddingModel'],
  'src/internal/messages/': ['AnthropicLanguageModel'],
  'src/internal/gemini/': ['GoogleLanguageModel'],
  // Phase 0a: per-vendor catalog files from the shared workspace source.
  'foundry-catalog/src/openai-models': [
    'OpenAiLanguageModel',
    'OpenAiDecisionModel',
    'OpenAiEmbeddingModel',
    'OpenAiChatLanguageModel',
  ],
  'foundry-catalog/src/anthropic-models': ['AnthropicLanguageModel'],
  'foundry-catalog/src/google-models': ['GoogleLanguageModel'],
  'foundry-catalog/src/xai-models': ['XaiLanguageModel'],
  // The all-vendor catalog would put every vendor's models in every bundle.
  'foundry-catalog/src/catalog': [],
};

// Minified bytes with effect external. Set each module's real budget when its phase lands.
const budgets = {
  FoundryClient: 16_000,
  OpenAiDecisionModel: 24_000,
  default: 64_000,
};

const modules = readdirSync(distRoot)
  .filter((file) => file.endsWith('.js'))
  .map((file) => file.slice(0, -'.js'.length))
  .sort();
if (modules.length === 0) {
  throw new Error(`No public modules in ${distRoot}; run the build first.`);
}

const scratch = mkdtempSync(join(tmpdir(), 'foundry-effect-ai-tree-shaking-'));
const failures = [];
try {
  mkdirSync(join(scratch, 'node_modules/@nyrra'), { recursive: true });
  symlinkSync(packageRoot, join(scratch, 'node_modules/@nyrra/foundry-effect-ai'), 'dir');
  symlinkSync(resolve('node_modules/effect'), join(scratch, 'node_modules/effect'), 'dir');
  writeFileSync(join(scratch, 'package.json'), '{"type":"module"}\n');

  for (const name of modules) {
    // A namespace export keeps the module's whole public surface: the worst case for size.
    writeFileSync(
      join(scratch, `${name}.ts`),
      `export * as M from '@nyrra/foundry-effect-ai/${name}';\n`,
    );
    const result = await build({
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
    });
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
      const publicModule = /\/src\/([A-Z]\w+)\.js$/.exec(input)?.[1];
      if (publicModule && publicModule !== name && publicModule !== 'FoundryClient') {
        failures.push(`${name} bundles the public module ${publicModule}.`);
      }
    }
    console.log(`${name}: ${bytes} bytes`);
  }

  // Internal modules are not part of the exports map.
  const internal = await build({
    absWorkingDir: scratch,
    stdin: {
      contents: "import '@nyrra/foundry-effect-ai/internal/notImplemented';",
      resolveDir: scratch,
    },
    bundle: true,
    write: false,
    external: ['effect', 'effect/*'],
    logLevel: 'silent',
  }).then(
    () => true,
    () => false,
  );
  if (internal) {
    failures.push('@nyrra/foundry-effect-ai/internal/* resolved; the exports map must block it.');
  }

  // Consumers typecheck each module through the exports map with no other package installed.
  try {
    execFileSync(
      resolve('node_modules/.bin/tsc'),
      [
        '--ignoreConfig',
        '--noEmit',
        '--strict',
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
