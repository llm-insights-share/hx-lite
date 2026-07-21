/** CLI exit codes (stable for CI scripting). */
export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;
export const EXIT_CONFIG = 3;

export class UsageError extends Error {
  readonly exitCode = EXIT_USAGE;
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class ConfigError extends Error {
  readonly exitCode = EXIT_CONFIG;
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function exitWith(code: number, message?: string): never {
  if (message) console.error(message);
  process.exit(code);
}

export function exitFromError(err: unknown): never {
  if (err instanceof UsageError) exitWith(EXIT_USAGE, `hx: ${err.message}`);
  if (err instanceof ConfigError) exitWith(EXIT_CONFIG, `hx: ${err.message}`);
  const msg = err instanceof Error ? err.message : String(err);
  exitWith(EXIT_FAIL, `hx: ${msg}`);
}
