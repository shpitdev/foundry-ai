import process from 'node:process';
import { inspect } from 'node:util';

const LOG_INSPECT_OPTIONS = {
  breakLength: 120,
  colors: process.stdout.isTTY,
  compact: false,
  depth: null,
  maxArrayLength: null,
  sorted: true,
} as const;

export function logValue(value: unknown): void {
  console.log(inspect(value, LOG_INSPECT_OPTIONS));
}

export function logError(value: unknown): void {
  console.error(inspect(value, LOG_INSPECT_OPTIONS));
}
