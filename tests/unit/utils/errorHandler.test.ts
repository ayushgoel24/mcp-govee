import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import { AppError, ErrorCode, ValidationError, NotFoundError } from '../../../src/utils/errors.js';

describe('Error Handler Plugin', () => {
  let server: FastifyInstance;

  const testConfig: Config = {
    port: 0,
    host: '127.0.0.1',
    nodeEnv: 'test',
    goveeApiKey: 'test-api-key',
    mcpClientTokens: ['test-token'],
    deviceCacheTtlMs: 300000,
    perClientRateLimit: 60,
    rateLimitWindowMs: 60000,
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 10000,
    coalesceWindowMs: 200,
    logLevel: 'error',
  };

  beforeAll(async () => {
    server = createServer({ config: testConfig });

    // Add test routes that throw different error types
    server.get('/throw-validation', async () => {
      throw new ValidationError('Invalid field value', { field: 'test', expected: 'string' });
    });

    server.get('/throw-app-error', async () => {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'Something went wrong', 500);
    });

    server.get('/throw-not-found', async () => {
      throw new NotFoundError('Device not found', { deviceId: 'test-device' });
    });

    server.get('/throw-zod-error', async () => {
      const schema = z.object({ name: z.string() });
      schema.parse({ name: 123 }); // Will throw ZodError
    });

    server.get('/throw-unknown', async () => {
      throw new Error('Unknown error');
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    resetConfig();
  });

  it('should handle ValidationError with 400 status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-validation',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
    expect(body.error.message).toBe('Invalid field value');
    expect(body.error.details).toEqual({ field: 'test', expected: 'string' });
  });

  it('should handle AppError with specified status code', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-app-error',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('should handle NotFoundError with 404 status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-not-found',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
    expect(body.error.details).toEqual({ deviceId: 'test-device' });
  });

  it('should handle ZodError with 400 status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-zod-error',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
  });

  it('should handle unknown errors with 500 status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-unknown',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('should return JSON content type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/throw-validation',
    });

    expect(response.headers['content-type']).toContain('application/json');
  });

  it('should always have ok: false in error response', async () => {
    const responses = await Promise.all([
      server.inject({ method: 'GET', url: '/throw-validation' }),
      server.inject({ method: 'GET', url: '/throw-app-error' }),
      server.inject({ method: 'GET', url: '/throw-not-found' }),
      server.inject({ method: 'GET', url: '/throw-unknown' }),
    ]);

    for (const response of responses) {
      expect(response.json().ok).toBe(false);
    }
  });

  it('should always have error object with code and message', async () => {
    const responses = await Promise.all([
      server.inject({ method: 'GET', url: '/throw-validation' }),
      server.inject({ method: 'GET', url: '/throw-app-error' }),
      server.inject({ method: 'GET', url: '/throw-not-found' }),
      server.inject({ method: 'GET', url: '/throw-unknown' }),
    ]);

    for (const response of responses) {
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
    }
  });
});
