import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import { GoveeApiError, ErrorCode } from '../../../src/utils/errors.js';

// Mock the GoveeClient
const mockGetDevices = vi.fn();
const mockControlDevice = vi.fn();

vi.mock('../../../src/clients/govee.client.js', () => ({
  GoveeClient: {
    fromConfig: () => ({
      getDevices: mockGetDevices,
      controlDevice: mockControlDevice,
      healthCheck: vi.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Rate Limit Integration Tests', () => {
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
    maxRetries: 0, // Disable retries at service level for predictable tests
    initialBackoffMs: 10,
    maxBackoffMs: 50,
    coalesceWindowMs: 200,
    logLevel: 'error',
  };

  const mockDevices = [
    {
      device: 'AA:BB:CC:DD:EE:FF',
      model: 'H6160',
      deviceName: 'Test Light',
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness', 'color'],
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
    server.deviceService.invalidateCache();
  });

  describe('GET /devices - Rate Limit Handling', () => {
    it('should return 503 when Govee API returns 429 rate limit', async () => {
      mockGetDevices.mockRejectedValue(GoveeApiError.rateLimited());

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
      expect(body.error.message).toContain('rate limit');
    });

    it('should return 502 when Govee API returns 5xx server error', async () => {
      mockGetDevices.mockRejectedValue(
        GoveeApiError.unavailable('Govee API server error: 500')
      );

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });

    it('should return 502 on network timeout', async () => {
      mockGetDevices.mockRejectedValue(
        GoveeApiError.unavailable('Govee API request timed out')
      );

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.error.message).toContain('timed out');
    });

    it('should return 200 on successful response after API recovers', async () => {
      mockGetDevices.mockResolvedValue(mockDevices);

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.result.devices).toHaveLength(1);
    });
  });

  describe('POST /mcp/invoke - Rate Limit Handling', () => {
    beforeEach(async () => {
      // Pre-populate device cache for control tests
      mockGetDevices.mockResolvedValue(mockDevices);
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });
      vi.clearAllMocks();
    });

    it('should handle rate limit on control request', async () => {
      mockControlDevice.mockRejectedValue(GoveeApiError.rateLimited());

      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'turn',
          params: {
            device: 'AA:BB:CC:DD:EE:FF',
            power: 'on',
          },
        },
      });

      expect(response.statusCode).toBe(200); // Tool invocation returns 200 with error in body
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
    });

    it('should handle unavailable error on control request', async () => {
      mockControlDevice.mockRejectedValue(
        GoveeApiError.unavailable('Govee API server error')
      );

      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'brightness',
          params: {
            device: 'AA:BB:CC:DD:EE:FF',
            level: 50,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });

    it('should succeed when control request completes', async () => {
      mockControlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'turn',
          params: {
            device: 'AA:BB:CC:DD:EE:FF',
            power: 'on',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('Error Code Mapping', () => {
    it('should map GOVEE_RATE_LIMITED to 503 status', async () => {
      mockGetDevices.mockRejectedValue(GoveeApiError.rateLimited());

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(503);
    });

    it('should map GOVEE_UNAVAILABLE to 502 status', async () => {
      mockGetDevices.mockRejectedValue(GoveeApiError.unavailable());

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(502);
    });

    it('should map GOVEE_API_ERROR to 502 status', async () => {
      mockGetDevices.mockRejectedValue(GoveeApiError.apiError('Bad request', 400));

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.error.code).toBe(ErrorCode.GOVEE_API_ERROR);
    });
  });
});
