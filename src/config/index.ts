export interface Config {
  // Server
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';

  // Authentication
  goveeApiKey: string;
  mcpClientTokens: string[];

  // Cache
  deviceCacheTtlMs: number;

  // Rate Limiting
  perClientRateLimit: number;
  rateLimitWindowMs: number;

  // Retry
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;

  // Command Coalescing
  coalesceWindowMs: number;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // Default Device
  defaultDeviceId?: string;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ConfigurationError(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

function getEnvStringArray(key: string, defaultValue: string[] = []): string[] {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function getEnvNodeEnv(): 'development' | 'production' | 'test' {
  const value = process.env['NODE_ENV'] ?? 'development';
  if (value !== 'development' && value !== 'production' && value !== 'test') {
    throw new ConfigurationError(`Invalid NODE_ENV: ${value}. Must be 'development', 'production', or 'test'`);
  }
  return value;
}

function getEnvLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
  const value = process.env['LOG_LEVEL'] ?? 'info';
  if (value !== 'debug' && value !== 'info' && value !== 'warn' && value !== 'error') {
    throw new ConfigurationError(`Invalid LOG_LEVEL: ${value}. Must be 'debug', 'info', 'warn', or 'error'`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    // Server
    port: getEnvNumber('PORT', 3000),
    host: getEnvString('HOST', '0.0.0.0'),
    nodeEnv: getEnvNodeEnv(),

    // Authentication
    goveeApiKey: getEnvString('GOVEE_API_KEY'),
    mcpClientTokens: getEnvStringArray('MCP_CLIENT_TOKENS'),

    // Cache
    deviceCacheTtlMs: getEnvNumber('DEVICE_CACHE_TTL_MS', 300000), // 5 minutes

    // Rate Limiting
    perClientRateLimit: getEnvNumber('PER_CLIENT_RATE_LIMIT', 60),
    rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute

    // Retry
    maxRetries: getEnvNumber('MAX_RETRIES', 3),
    initialBackoffMs: getEnvNumber('INITIAL_BACKOFF_MS', 1000),
    maxBackoffMs: getEnvNumber('MAX_BACKOFF_MS', 10000),

    // Command Coalescing
    coalesceWindowMs: getEnvNumber('COALESCE_WINDOW_MS', 200),

    // Logging
    logLevel: getEnvLogLevel(),

    // Default Device
    defaultDeviceId: process.env['DEFAULT_DEVICE_ID'] ?? undefined,
  };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig === null) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
