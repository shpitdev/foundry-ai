import type { FoundryConfig } from './types.js';

const FOUNDRY_URL_ENV = 'FOUNDRY_URL';
const FOUNDRY_TOKEN_ENV = 'FOUNDRY_TOKEN';
const FOUNDRY_ATTRIBUTION_RID_ENV = 'FOUNDRY_ATTRIBUTION_RID';
const FOUNDRY_TRACE_PARENT_ENV = 'FOUNDRY_TRACE_PARENT';
const FOUNDRY_TRACE_STATE_ENV = 'FOUNDRY_TRACE_STATE';
// Environment variables as `process.env` holds them, typed without Node's ambient types so the
// published declarations do not need @types/node.
type Env = Readonly<Record<string, string | undefined>>;

const TRACE_PARENT_PATTERN = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u;

export function loadFoundryConfig(env: Env = process.env): FoundryConfig {
  return normalizeResolvedFoundryConfig({
    foundryUrl: requireEnv(env, FOUNDRY_URL_ENV),
    token: requireEnv(env, FOUNDRY_TOKEN_ENV),
    attributionRid: optionalEnv(env, FOUNDRY_ATTRIBUTION_RID_ENV),
    traceParent: optionalEnv(env, FOUNDRY_TRACE_PARENT_ENV),
    traceState: optionalEnv(env, FOUNDRY_TRACE_STATE_ENV),
  });
}

export function normalizeFoundryUrl(foundryUrl: string): string {
  const trimmed = foundryUrl.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '/') {
    end -= 1;
  }
  return trimmed.slice(0, end);
}

export function resolveFoundryConfig(config: FoundryConfig, callerName: string): FoundryConfig {
  const normalizedConfig = normalizeResolvedFoundryConfig({
    foundryUrl: typeof config.foundryUrl === 'string' ? config.foundryUrl : '',
    token: typeof config.token === 'string' ? config.token : '',
    attributionRid: typeof config.attributionRid === 'string' ? config.attributionRid : undefined,
    traceParent: typeof config.traceParent === 'string' ? config.traceParent : undefined,
    traceState: typeof config.traceState === 'string' ? config.traceState : undefined,
  });

  if (normalizedConfig.foundryUrl.length === 0) {
    throw new Error(`${callerName} requires config.foundryUrl to be a non-empty string.`);
  }

  if (normalizedConfig.token.length === 0) {
    throw new Error(`${callerName} requires config.token to be a non-empty string.`);
  }

  return normalizedConfig;
}

/** Attribution and trace headers for the configured values; `undefined` when there are none. */
export function foundryHeaders(config: FoundryConfig): Record<string, string> | undefined {
  const headers = {
    ...(config.attributionRid === undefined ? {} : { attribution: config.attributionRid }),
    ...(config.traceParent === undefined ? {} : { traceParent: config.traceParent }),
    ...(config.traceState === undefined ? {} : { traceState: config.traceState }),
  };
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function requireEnv(env: Env, name: string): string {
  const value = optionalEnv(env, name);

  if (value == null) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(env: Env, name: string): string | undefined {
  return nonEmpty(env[name]);
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizeResolvedFoundryConfig(config: {
  foundryUrl: string;
  token: string;
  attributionRid?: string;
  traceParent?: string;
  traceState?: string;
}): FoundryConfig {
  const traceParent = nonEmpty(config.traceParent);

  if (traceParent !== undefined && !TRACE_PARENT_PATTERN.test(traceParent)) {
    throw new Error(
      'Foundry traceParent must match the W3C traceparent format: <2 lowercase hex version>-<32 lowercase hex trace ID>-<16 lowercase hex parent ID>-<2 lowercase hex flags>.',
    );
  }

  return {
    foundryUrl: normalizeFoundryUrl(config.foundryUrl),
    token: config.token.trim(),
    attributionRid: nonEmpty(config.attributionRid),
    traceParent,
    traceState: nonEmpty(config.traceState),
  };
}
