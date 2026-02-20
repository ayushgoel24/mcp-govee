import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';

describe('Health Routes', () => {
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
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    resetConfig();
  });

  describe('GET /healthz', () => {
    it('should return 200 with status ok', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('should return JSON content type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should not require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
