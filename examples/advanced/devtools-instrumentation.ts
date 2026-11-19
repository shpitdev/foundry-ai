import process from 'node:process';
import { devToolsMiddleware } from '@ai-sdk/devtools';
import { wrapLanguageModel } from 'ai';

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

export function wrapWithDevTools(model: WrappableModel): WrappableModel {
  return wrapLanguageModel({
    model,
    middleware: devToolsMiddleware(),
  });
}

export function logDevToolsHint() {
  const port = process.env.AI_SDK_DEVTOOLS_PORT ?? '4983';
  console.log(`\n  devtools: capturing to .devtools/generations.json`);
  console.log(`  viewer:   npx @ai-sdk/devtools → http://localhost:${port}\n`);
}
