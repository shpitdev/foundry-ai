import { defineConfig, type Options } from 'tsup';

const entries = {
  index: 'src/index.ts',
  'providers/realtime': 'src/providers/realtime.ts',
  'providers/openai': 'src/providers/openai.ts',
  'providers/anthropic': 'src/providers/anthropic.ts',
  'providers/google': 'src/providers/google.ts',
  'providers/xai': 'src/providers/xai.ts',
  'providers/deepseek': 'src/providers/deepseek.ts',
  'providers/nvidia': 'src/providers/nvidia.ts',
  'providers/qwen': 'src/providers/qwen.ts',
  'providers/moonshot': 'src/providers/moonshot.ts',
  'providers/zai': 'src/providers/zai.ts',
  'providers/gemma': 'src/providers/gemma.ts',
};

function build(entry: Record<string, string>, output: Pick<Options, 'dts' | 'sourcemap'>): Options {
  return {
    ...output,
    entry,
    external: [
      'ai',
      '@ai-sdk/anthropic',
      '@ai-sdk/google',
      '@ai-sdk/openai',
      '@ai-sdk/openai-compatible',
      '@ai-sdk/xai',
    ],
    format: ['esm', 'cjs'],
    outExtension({ format }) {
      return {
        js: format === 'esm' ? '.mjs' : '.cjs',
      };
    },
    outDir: 'dist',
    target: 'es2022',
    tsconfig: './tsconfig.lib.json',
  };
}

// The Nx build target empties dist first: these builds run in parallel, so none may clean it.
export default defineConfig([
  build(entries, { sourcemap: true }),
  // One declaration build per entry. Bundled together, tsup 9 points an entry's shared types at
  // another public entry, so a provider subpath would load the root entry's declarations.
  ...Object.entries(entries).map(([name, source]) =>
    build({ [name]: source }, { dts: { only: true } }),
  ),
]);
