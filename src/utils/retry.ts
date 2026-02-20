import { GoveeApiError, ErrorCode } from './errors.js';

export interface RetryOptions {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  correlationId?: string;
  logger?: RetryLogger;
}

export interface RetryLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

/**
 * Determines if an error is retryable.
 * Retry on: 429 (rate limit), 5xx (server errors), network timeouts
 * Do NOT retry on: 4xx (except 429), validation errors
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GoveeApiError) {
    // 429 is retryable
    if (error.goveeCode === 429 || error.code === ErrorCode.GOVEE_RATE_LIMITED) {
      return true;
    }
    // 5xx errors are retryable (GOVEE_UNAVAILABLE)
    if (error.code === ErrorCode.GOVEE_UNAVAILABLE) {
      return true;
    }
    // 4xx errors (except 429) are NOT retryable
    if (error.goveeCode !== undefined && error.goveeCode >= 400 && error.goveeCode < 500) {
      return false;
    }
  }

  // Network timeout errors are retryable
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return true;
    }
    // Network errors (TypeError from fetch) are retryable
    if (error instanceof TypeError) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate backoff delay with exponential increase and jitter.
 * Formula: min(initial * 2^attempt + jitter, max)
 * Jitter is 0-30% of the exponential value to prevent thundering herd.
 */
export function calculateBackoff(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number
): number {
  const exponential = initialBackoffMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential; // 0-30% jitter
  return Math.min(exponential + jitter, maxBackoffMs);
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * RetryHandler provides retry logic with exponential backoff and jitter.
 * It retries on 429 (rate limit), 5xx errors, and network timeouts.
 * It does NOT retry on 4xx errors (except 429).
 */
export class RetryHandler {
  private readonly options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      initialBackoffMs: options.initialBackoffMs ?? 1000,
      maxBackoffMs: options.maxBackoffMs ?? 10000,
      correlationId: options.correlationId,
      logger: options.logger,
    };
  }

  /**
   * Execute a function with retry logic.
   * Returns the result on success, throws after all retries exhausted.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Check if we should retry
        if (!isRetryableError(error)) {
          this.log('debug', `Non-retryable error on attempt ${attempt + 1}`, {
            error: err.message,
            errorType: err.name,
          });
          throw error;
        }

        // Check if we have retries left
        if (attempt >= this.options.maxRetries) {
          this.log('warn', `All ${this.options.maxRetries} retries exhausted`, {
            error: err.message,
            errorType: err.name,
          });
          break;
        }

        // Calculate and apply backoff
        const backoffMs = calculateBackoff(
          attempt,
          this.options.initialBackoffMs,
          this.options.maxBackoffMs
        );

        this.log('warn', `Retrying after ${Math.round(backoffMs)}ms (attempt ${attempt + 1}/${this.options.maxRetries})`, {
          error: err.message,
          errorType: err.name,
          backoffMs: Math.round(backoffMs),
          attempt: attempt + 1,
          maxRetries: this.options.maxRetries,
        });

        await sleep(backoffMs);
      }
    }

    // All retries exhausted - throw appropriate error
    if (lastError instanceof GoveeApiError && lastError.code === ErrorCode.GOVEE_RATE_LIMITED) {
      throw GoveeApiError.rateLimited();
    }

    throw lastError ?? new Error('Retry failed with unknown error');
  }

  /**
   * Execute with retry and return a result object instead of throwing.
   */
  async executeWithResult<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    let attempts = 0;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      attempts = attempt + 1;
      try {
        const result = await fn();
        return { success: true, result, attempts };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (!isRetryableError(error) || attempt >= this.options.maxRetries) {
          return { success: false, error: err, attempts };
        }

        const backoffMs = calculateBackoff(
          attempt,
          this.options.initialBackoffMs,
          this.options.maxBackoffMs
        );

        await sleep(backoffMs);
      }
    }

    return { success: false, error: new Error('Retry failed'), attempts };
  }

  /**
   * Log a message with context.
   */
  private log(level: 'debug' | 'warn', message: string, context: Record<string, unknown> = {}): void {
    if (this.options.logger === undefined) {
      return;
    }

    const fullContext = {
      ...context,
      ...(this.options.correlationId !== undefined ? { correlationId: this.options.correlationId } : {}),
    };

    if (level === 'debug') {
      this.options.logger.debug(message, fullContext);
    } else {
      this.options.logger.warn(message, fullContext);
    }
  }
}

/**
 * Create a RetryHandler from config values.
 */
export function createRetryHandler(
  config: { maxRetries: number; initialBackoffMs: number; maxBackoffMs: number },
  options?: { correlationId?: string; logger?: RetryLogger }
): RetryHandler {
  return new RetryHandler({
    maxRetries: config.maxRetries,
    initialBackoffMs: config.initialBackoffMs,
    maxBackoffMs: config.maxBackoffMs,
    correlationId: options?.correlationId,
    logger: options?.logger,
  });
}
