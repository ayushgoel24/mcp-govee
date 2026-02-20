import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import { mockDevices } from '../mocks/index.js';

// Mock the GoveeClient
const mockGetDevices = vi.fn();

vi.mock('../../../src/clients/govee.client.js', () => ({
  GoveeClient: {
    fromConfig: () => ({
      getDevices: mockGetDevices,
      controlDevice: vi.fn(),
      healthCheck: vi.fn(),
    }),
  },
}));

describe('Devices Routes', () => {
  let server: FastifyInstance;

  const testConfig: Config = {
    port: 0,
    host: '127.0.0.1',
    nodeEnv: 'test',
    goveeApiKey: 'test-api-key',
    mcpClientTokens: ['test-token', 'another-token'],
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

  beforeEach(() => {
    vi.clearAllMocks();
    // Invalidate cache before each test
    server.deviceService.invalidateCache();
  });

  describe('GET /devices', () => {
    describe('authentication', () => {
      it('should return 401 when no auth header is provided', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/devices',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      });

      it('should return 401 when invalid token is provided', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
          },
        });
      });

      it('should return 401 when empty auth header is provided', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': '',
          },
        });

        expect(response.statusCode).toBe(401);
      });

      it('should accept valid token', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept any valid token from the list', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'another-token',
          },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('device discovery - fresh fetch from API', () => {
      it('should fetch devices from API on first call', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(body.result.cached).toBe(false);
        expect(body.result.cacheAge).toBe(0);
        expect(mockGetDevices).toHaveBeenCalledTimes(1);
      });

      it('should return all devices from API', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const body = response.json();
        expect(body.result.devices).toHaveLength(mockDevices.length);
      });

      it('should handle empty device list', async () => {
        mockGetDevices.mockResolvedValueOnce([]);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(body.result.devices).toHaveLength(0);
      });
    });

    describe('device discovery - cached response', () => {
      it('should return cached response on subsequent calls', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        // First call - fetches from API
        await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        // Second call - should use cache
        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const body = response.json();
        expect(body.result.cached).toBe(true);
        expect(mockGetDevices).toHaveBeenCalledTimes(1); // Only called once
      });

      it('should include cacheAge for cached responses', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        // First call
        await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        // Second call
        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const body = response.json();
        expect(typeof body.result.cacheAge).toBe('number');
        expect(body.result.cacheAge).toBeGreaterThanOrEqual(0);
      });

      it('should return same data from cache', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        // First call
        const firstResponse = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        // Second call
        const secondResponse = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const firstBody = firstResponse.json();
        const secondBody = secondResponse.json();

        expect(secondBody.result.devices).toEqual(firstBody.result.devices);
      });
    });

    describe('device discovery - API error handling', () => {
      it('should handle API unavailable error (502)', async () => {
        const { GoveeApiError, ErrorCode } = await import('../../../src/utils/errors.js');
        mockGetDevices.mockRejectedValueOnce(
          new GoveeApiError(ErrorCode.GOVEE_UNAVAILABLE, 'API unavailable', 502)
        );

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(502);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('GOVEE_UNAVAILABLE');
      });

      it('should handle rate limit error (503)', async () => {
        const { GoveeApiError, ErrorCode } = await import('../../../src/utils/errors.js');
        mockGetDevices.mockRejectedValueOnce(
          new GoveeApiError(ErrorCode.GOVEE_RATE_LIMITED, 'Rate limit exceeded', 503)
        );

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(503);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('GOVEE_RATE_LIMITED');
      });

      it('should handle authentication error from Govee API', async () => {
        const { GoveeApiError, ErrorCode } = await import('../../../src/utils/errors.js');
        mockGetDevices.mockRejectedValueOnce(
          new GoveeApiError(ErrorCode.GOVEE_API_ERROR, 'Invalid API key', 401)
        );

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(401);
        const body = response.json();
        expect(body.ok).toBe(false);
      });
    });

    describe('response format', () => {
      it('should return devices with ok: true format', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(body.result).toBeDefined();
        expect(body.result.devices).toBeInstanceOf(Array);
      });

      it('should return transformed device objects', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const body = response.json();
        const device = body.result.devices[0];

        expect(device).toMatchObject({
          deviceId: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          deviceName: 'Living Room Light',
          controllable: true,
          retrievable: true,
          supportedCommands: ['turn', 'brightness', 'color'],
        });
      });

      it('should return JSON content type', async () => {
        mockGetDevices.mockResolvedValueOnce(mockDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        expect(response.headers['content-type']).toContain('application/json');
      });
    });
  });
});
