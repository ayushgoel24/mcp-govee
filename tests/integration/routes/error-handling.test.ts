import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import { GoveeApiError, ErrorCode } from '../../../src/utils/errors.js';
import { mockDevices, successfulControlResponse } from '../mocks/index.js';

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

describe('Error Handling Integration Tests', () => {
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
    maxRetries: 0, // Disable retries for predictable tests
    initialBackoffMs: 10,
    maxBackoffMs: 50,
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
    server.deviceService.invalidateCache();
  });

  describe('Authentication Failure', () => {
    it('should return 401 for GET /devices without auth header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/devices',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('should return 401 for GET /devices with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'invalid-token' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for POST /mcp/invoke without auth header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        payload: { tool: 'list_devices' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for POST /mcp/invoke with invalid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'wrong-token' },
        payload: { tool: 'list_devices' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow access with valid token', async () => {
      mockGetDevices.mockResolvedValueOnce(mockDevices);

      const response = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('Validation Errors', () => {
    it('should return error for missing tool parameter', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: { params: {} },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return error for unknown tool', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: { tool: 'nonexistent_tool', params: {} },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toContain('Invalid tool');
    });

    it('should return error for invalid brightness level', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'brightness',
          params: { device: 'AA:BB:CC:DD:EE:FF', level: -10 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return error for invalid color values', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'color',
          params: { device: 'AA:BB:CC:DD:EE:FF', r: 300, g: 0, b: 0 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return error for invalid power value', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'turn',
          params: { device: 'AA:BB:CC:DD:EE:FF', power: 'maybe' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Retry on 429 Rate Limit', () => {
    it('should return 503 when rate limited without retry', async () => {
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
    });

    it('should succeed after rate limit clears', async () => {
      // First request: rate limited
      mockGetDevices.mockRejectedValueOnce(GoveeApiError.rateLimited());

      const firstResponse = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(firstResponse.statusCode).toBe(503);

      // Clear mock for subsequent call
      vi.clearAllMocks();
      server.deviceService.invalidateCache();

      // Second request: success
      mockGetDevices.mockResolvedValueOnce(mockDevices);

      const secondResponse = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(secondResponse.statusCode).toBe(200);
      const body = secondResponse.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('Retry Exhaustion - Returns 503', () => {
    it('should return 503 for persistent rate limit errors', async () => {
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

    it('should return 503 for rate limit on control requests', async () => {
      // Pre-populate device cache
      mockGetDevices.mockResolvedValueOnce(mockDevices);
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      mockControlDevice.mockRejectedValue(GoveeApiError.rateLimited());

      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'turn',
          params: { device: 'AA:BB:CC:DD:EE:FF', power: 'on' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
    });
  });

  describe('Server Error Handling - Returns 502', () => {
    it('should return 502 for 500 Internal Server Error', async () => {
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

    it('should return 502 for 502 Bad Gateway', async () => {
      mockGetDevices.mockRejectedValue(
        GoveeApiError.unavailable('Govee API server error: 502')
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

    it('should return 502 for 503 Service Unavailable', async () => {
      mockGetDevices.mockRejectedValue(
        GoveeApiError.unavailable('Govee API server error: 503')
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

    it('should return 502 for network timeout', async () => {
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
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
      expect(body.error.message).toContain('timed out');
    });

    it('should return 502 for network connection failure', async () => {
      mockGetDevices.mockRejectedValue(
        GoveeApiError.unavailable('Failed to connect to Govee API')
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

    it('should return 502 on control request with server error', async () => {
      // Pre-populate device cache
      mockGetDevices.mockResolvedValueOnce(mockDevices);
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      mockControlDevice.mockRejectedValue(
        GoveeApiError.unavailable('Govee API server error: 500')
      );

      const response = await server.inject({
        method: 'POST',
        url: '/mcp/invoke',
        headers: { 'x-mcp-auth': 'test-token' },
        payload: {
          tool: 'turn',
          params: { device: 'AA:BB:CC:DD:EE:FF', power: 'on' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });
  });

  describe('Error Recovery', () => {
    it('should recover after transient server error', async () => {
      // First request: server error
      mockGetDevices.mockRejectedValueOnce(
        GoveeApiError.unavailable('Govee API server error: 500')
      );

      const firstResponse = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(firstResponse.statusCode).toBe(502);

      // Clear for next request
      server.deviceService.invalidateCache();

      // Second request: success
      mockGetDevices.mockResolvedValueOnce(mockDevices);

      const secondResponse = await server.inject({
        method: 'GET',
        url: '/devices',
        headers: { 'x-mcp-auth': 'test-token' },
      });

      expect(secondResponse.statusCode).toBe(200);
      const body = secondResponse.json();
      expect(body.ok).toBe(true);
      expect(body.result.devices).toHaveLength(mockDevices.length);
    });
  });
});
