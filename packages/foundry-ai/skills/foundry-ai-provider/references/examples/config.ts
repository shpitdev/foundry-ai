import { resolve } from 'node:path';
import process from 'node:process';
import type { AnthropicModelId, GoogleModelId, OpenAIModelId } from '@nyrra/foundry-ai';

export type ProviderName = 'openai' | 'anthropic' | 'google';

const LOCAL_ENV_FILE = resolve(process.cwd(), '.env.local');

export const DEFAULT_OPENAI_MODEL: OpenAIModelId = 'gpt-5.6-terra';
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-sonnet-5';
export const DEFAULT_GOOGLE_MODEL: GoogleModelId = 'gemini-3.6-flash';

export function resolveCliProvider(defaultProvider: ProviderName = 'openai'): ProviderName {
  const provider = process.argv[2];

  if (provider == null) {
    return defaultProvider;
  }

  if (provider === 'openai' || provider === 'anthropic' || provider === 'google') {
    return provider;
  }

  throw new Error(
    `Unsupported provider "${provider}". Expected "openai", "anthropic", or "google".`,
  );
}

export function resolveCliModelId(): string | undefined {
  return process.argv[3];
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

maybeLoadLocalEnvFile();

function maybeLoadLocalEnvFile() {
  if (process.env.FOUNDRY_URL && process.env.FOUNDRY_TOKEN) {
    return;
  }

  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  try {
    process.loadEnvFile(LOCAL_ENV_FILE);
  } catch {
    // Let the example surface missing environment variables naturally.
  }
}
