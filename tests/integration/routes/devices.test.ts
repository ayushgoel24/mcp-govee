import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import type { GoveeDevice } from '../../../src/types/index.js';

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

  const mockGoveeDevices: GoveeDevice[] = [
    {
      device: 'AA:BB:CC:DD:EE:FF',
      model: 'H6160',
      deviceName: 'Living Room Light',
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness', 'color'],
    },
    {
      device: '11:22:33:44:55:66',
      model: 'H6141',
      deviceName: 'Bedroom Light',
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness'],
    },
  ];

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
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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

    describe('response format', () => {
      it('should return devices with ok: true format', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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
        expect(body.result.devices).toHaveLength(2);
      });

      it('should return transformed device objects', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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

    describe('caching', () => {
      it('should indicate fresh response on first call', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

        const response = await server.inject({
          method: 'GET',
          url: '/devices',
          headers: {
            'x-mcp-auth': 'test-token',
          },
        });

        const body = response.json();
        expect(body.result.cached).toBe(false);
        expect(body.result.cacheAge).toBe(0);
      });

      it('should indicate cached response on subsequent calls', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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
        expect(body.result.cached).toBe(true);
        expect(mockGetDevices).toHaveBeenCalledTimes(1);
      });

      it('should include cacheAge for cached responses', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

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
    });

    describe('error handling', () => {
      it('should handle API errors gracefully', async () => {
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
    });
  });
});
