import { rm } from 'node:fs/promises';

const generatedPaths = [
  'packages/foundry-ai/dist',
  'packages/foundry-ai/dist-types',
  'packages/foundry-effect-ai/dist',
  'out-tsc',
  'tsconfig.tsbuildinfo',
];

await Promise.all(
  generatedPaths.map(async (path) => {
    await rm(path, { force: true, recursive: true });
  }),
);
