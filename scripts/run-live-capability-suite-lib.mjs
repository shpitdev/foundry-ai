const LIVE_CAPABILITY_MAX_CONCURRENCY_ENV = 'LIVE_CAPABILITY_MAX_CONCURRENCY';

export function parseArgs(args, env = process.env) {
  const passthroughArgs = [];
  const extraEnv = {};
  let shouldUpdateDocs = args.length === 0;
  let modelWasSelected = false;
  let scopeWasExplicitlySelected = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--canonical') {
      extraEnv.LIVE_MODEL_SCOPE = 'canonical';
      scopeWasExplicitlySelected = true;
      continue;
    }

    if (arg === '--catalog') {
      extraEnv.LIVE_MODEL_SCOPE = 'catalog';
      scopeWasExplicitlySelected = true;

      if (!env[LIVE_CAPABILITY_MAX_CONCURRENCY_ENV]) {
        extraEnv[LIVE_CAPABILITY_MAX_CONCURRENCY_ENV] = '1';
      }

      continue;
    }

    if (arg === '--update-docs') {
      shouldUpdateDocs = true;
      continue;
    }

    if (arg === '--no-update-docs') {
      shouldUpdateDocs = false;
      continue;
    }

    if (arg === '--provider') {
      const provider = args[index + 1];

      if (!isLiveProvider(provider)) {
        throw new Error('Expected --provider to be one of openai, anthropic, google, third-party.');
      }

      extraEnv.LIVE_PROVIDER_FILTER = provider;
      index += 1;
      continue;
    }

    if (arg === '--model') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a value after --model.');
      }

      const selection = parseModelSelection(value);

      extraEnv.LIVE_MODEL_FILTER = selection.modelId;
      modelWasSelected = true;

      if (selection.provider) {
        extraEnv.LIVE_PROVIDER_FILTER = selection.provider;
      }

      index += 1;
      continue;
    }

    passthroughArgs.push(arg);
  }

  if (shouldPromoteModelSelectionToCatalog({ env, modelWasSelected, scopeWasExplicitlySelected })) {
    extraEnv.LIVE_MODEL_SCOPE = 'catalog';
  }

  return {
    extraEnv,
    extraVitestArgs: passthroughArgs,
    shouldUpdateDocs,
  };
}

export function parseModelSelection(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Expected --model to receive a non-empty value.');
  }

  const separatorIndex = trimmed.indexOf(':');

  if (separatorIndex <= 0) {
    return { modelId: trimmed };
  }

  const provider = trimmed.slice(0, separatorIndex);
  const modelId = trimmed.slice(separatorIndex + 1);

  if (!isLiveProvider(provider)) {
    return { modelId: trimmed };
  }

  if (!modelId) {
    throw new Error(
      'Expected --model provider:modelId to include a model id after the provider prefix.',
    );
  }

  return { modelId, provider };
}

export function isLiveProvider(value) {
  return (
    value === 'openai' || value === 'anthropic' || value === 'google' || value === 'third-party'
  );
}

function shouldPromoteModelSelectionToCatalog({
  env,
  modelWasSelected,
  scopeWasExplicitlySelected,
}) {
  if (!modelWasSelected) {
    return false;
  }

  if (scopeWasExplicitlySelected) {
    return false;
  }

  return env.LIVE_MODEL_SCOPE == null;
}
