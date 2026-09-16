import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'providers/realtime': 'src/providers/realtime.ts',
    'providers/openai': 'src/providers/openai.ts',
    'providers/anthropic': 'src/providers/anthropic.ts',
    'providers/google': 'src/providers/google.ts',
    'providers/xai': 'src/providers/xai.ts',
    'providers/third-party': 'src/providers/third-party.ts',
  },
  external: ['ai', '@ai-sdk/anthropic', '@ai-sdk/google', '@ai-sdk/openai', '@ai-sdk/xai'],
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    };
  },
  outDir: 'dist',
  sourcemap: true,
  target: 'es2022',
  tsconfig: './tsconfig.lib.json',
});
