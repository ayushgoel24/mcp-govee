import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';

// Mock the GoveeClient
const mockHealthCheck = vi.fn();

vi.mock('../../../src/clients/govee.client.js', () => ({
  GoveeClient: {
    fromConfig: () => ({
      getDevices: vi.fn(),
      controlDevice: vi.fn(),
      healthCheck: mockHealthCheck,
    }),
  },
}));

describe('Readiness Probe Routes', () => {
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
    vi.restoreAllMocks();
  });

  describe('GET /ready', () => {
    it('should return 200 with status ready when Govee API is healthy', async () => {
      mockHealthCheck.mockResolvedValueOnce(true);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ready',
        checks: {
          govee_api: 'up',
        },
      });
    });

    it('should return 503 with status not_ready when Govee API is unhealthy', async () => {
      mockHealthCheck.mockResolvedValueOnce(false);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'not_ready',
        checks: {
          govee_api: 'down',
        },
      });
    });

    it('should return JSON content type', async () => {
      mockHealthCheck.mockResolvedValueOnce(true);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should not require authentication', async () => {
      mockHealthCheck.mockResolvedValueOnce(true);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
        // No auth header provided
      });

      // Should not return 401
      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).toBe(200);
    });

    it('should include checks object with govee_api status', async () => {
      mockHealthCheck.mockResolvedValueOnce(true);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      const body = response.json();
      expect(body).toHaveProperty('checks');
      expect(body.checks).toHaveProperty('govee_api');
    });

    it('should handle Govee API returning false', async () => {
      mockHealthCheck.mockResolvedValueOnce(false);

      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().checks.govee_api).toBe('down');
    });
  });
});
