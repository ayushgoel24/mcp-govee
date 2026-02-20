import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RetryHandler,
  calculateBackoff,
  isRetryableError,
  createRetryHandler,
} from '../../../src/utils/retry.js';
import { GoveeApiError, ErrorCode } from '../../../src/utils/errors.js';

describe('Retry Handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateBackoff', () => {
    it('should calculate initial backoff for first attempt', () => {
      const backoff = calculateBackoff(0, 1000, 10000);
      // Exponential: 1000 * 2^0 = 1000
      // With jitter 0-30%, range is 1000-1300
      expect(backoff).toBeGreaterThanOrEqual(1000);
      expect(backoff).toBeLessThanOrEqual(1300);
    });

    it('should double backoff on each attempt', () => {
      // Attempt 1: base = 2000
      const backoff1 = calculateBackoff(1, 1000, 10000);
      expect(backoff1).toBeGreaterThanOrEqual(2000);
      expect(backoff1).toBeLessThanOrEqual(2600);

      // Attempt 2: base = 4000
      const backoff2 = calculateBackoff(2, 1000, 10000);
      expect(backoff2).toBeGreaterThanOrEqual(4000);
      expect(backoff2).toBeLessThanOrEqual(5200);

      // Attempt 3: base = 8000
      const backoff3 = calculateBackoff(3, 1000, 10000);
      expect(backoff3).toBeGreaterThanOrEqual(8000);
      expect(backoff3).toBeLessThanOrEqual(10000); // Capped
    });

    it('should cap backoff at maxBackoffMs', () => {
      // Attempt 10: would be 1000 * 2^10 = 1024000, but capped at 10000
      const backoff = calculateBackoff(10, 1000, 10000);
      expect(backoff).toBeLessThanOrEqual(10000);
    });

    it('should include jitter for randomness', () => {
      // Generate multiple backoffs and check they're not all the same
      const backoffs = new Set<number>();
      for (let i = 0; i < 20; i++) {
        backoffs.add(Math.round(calculateBackoff(1, 1000, 10000)));
      }
      // With jitter, we should see variation
      expect(backoffs.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for 429 rate limit error', () => {
      const error = GoveeApiError.rateLimited();
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for GoveeApiError with goveeCode 429', () => {
      const error = new GoveeApiError(
        ErrorCode.GOVEE_API_ERROR,
        'Too many requests',
        503,
        429
      );
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for GOVEE_UNAVAILABLE error (5xx)', () => {
      const error = GoveeApiError.unavailable();
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for 400 Bad Request', () => {
      const error = GoveeApiError.apiError('Bad request', 400);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 401 Unauthorized', () => {
      const error = GoveeApiError.apiError('Unauthorized', 401);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for 404 Not Found', () => {
      const error = GoveeApiError.apiError('Not found', 404);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for AbortError (timeout)', () => {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for timeout message', () => {
      const error = new Error('Request timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for TypeError (network error)', () => {
      const error = new TypeError('Failed to fetch');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Something went wrong');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('RetryHandler.execute', () => {
    it('should succeed on first attempt', async () => {
      const handler = new RetryHandler({ maxRetries: 3 });
      const fn = vi.fn().mockResolvedValue('success');

      const result = await handler.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialBackoffMs: 100,
        maxBackoffMs: 1000,
      });
      const fn = vi.fn()
        .mockRejectedValueOnce(GoveeApiError.rateLimited())
        .mockResolvedValueOnce('success');

      const resultPromise = handler.execute(fn);

      // First call fails, wait for backoff
      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-retryable error', async () => {
      const handler = new RetryHandler({ maxRetries: 3 });
      const error = GoveeApiError.apiError('Bad request', 400);
      const fn = vi.fn().mockRejectedValue(error);

      await expect(handler.execute(fn)).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const handler = new RetryHandler({
        maxRetries: 2,
        initialBackoffMs: 10, // Very short for fast test
        maxBackoffMs: 50,
      });
      const error = GoveeApiError.rateLimited();
      const fn = vi.fn().mockRejectedValue(error);

      await expect(handler.execute(fn)).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should log retry attempts when logger is provided', async () => {
      const logger = {
        debug: vi.fn(),
        warn: vi.fn(),
      };
      const handler = new RetryHandler({
        maxRetries: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 500,
        correlationId: 'test-123',
        logger,
      });
      const fn = vi.fn()
        .mockRejectedValueOnce(GoveeApiError.rateLimited())
        .mockResolvedValueOnce('success');

      const resultPromise = handler.execute(fn);
      await vi.advanceTimersByTimeAsync(200);
      await resultPromise;

      expect(logger.warn).toHaveBeenCalled();
      const warnCall = logger.warn.mock.calls[0];
      expect(warnCall[0]).toContain('Retrying');
      expect(warnCall[1]).toHaveProperty('correlationId', 'test-123');
    });
  });

  describe('RetryHandler.executeWithResult', () => {
    it('should return success result on first attempt', async () => {
      const handler = new RetryHandler({ maxRetries: 3 });
      const fn = vi.fn().mockResolvedValue('success');

      const result = await handler.executeWithResult(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should return failure result after exhausting retries', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 500,
      });
      const error = GoveeApiError.rateLimited();
      const fn = vi.fn().mockRejectedValue(error);

      const resultPromise = handler.executeWithResult(fn);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(3);
    });

    it('should return failure result for non-retryable error on first attempt', async () => {
      const handler = new RetryHandler({ maxRetries: 3 });
      const error = GoveeApiError.apiError('Bad request', 400);
      const fn = vi.fn().mockRejectedValue(error);

      const result = await handler.executeWithResult(fn);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attempts).toBe(1);
    });
  });

  describe('createRetryHandler', () => {
    it('should create handler with config values', async () => {
      const config = {
        maxRetries: 5,
        initialBackoffMs: 500,
        maxBackoffMs: 5000,
      };
      const handler = createRetryHandler(config);

      // Test that config is applied
      const fn = vi.fn().mockResolvedValue('success');
      await handler.execute(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should accept optional correlationId and logger', async () => {
      const logger = {
        debug: vi.fn(),
        warn: vi.fn(),
      };
      const config = {
        maxRetries: 2,
        initialBackoffMs: 100,
        maxBackoffMs: 500,
      };
      const handler = createRetryHandler(config, {
        correlationId: 'test-456',
        logger,
      });

      const fn = vi.fn()
        .mockRejectedValueOnce(GoveeApiError.rateLimited())
        .mockResolvedValueOnce('success');

      const resultPromise = handler.execute(fn);
      await vi.advanceTimersByTimeAsync(200);
      await resultPromise;

      expect(logger.warn).toHaveBeenCalled();
      const warnCall = logger.warn.mock.calls[0];
      expect(warnCall[1]).toHaveProperty('correlationId', 'test-456');
    });
  });
});
