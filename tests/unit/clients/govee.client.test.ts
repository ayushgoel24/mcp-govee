import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoveeClient } from '../../../src/clients/govee.client.js';
import { GoveeApiError, ErrorCode } from '../../../src/utils/errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GoveeClient', () => {
  let client: GoveeClient;

  beforeEach(() => {
    // Create client with retries disabled for unit tests
    // Retry behavior is tested separately in retry.test.ts
    client = new GoveeClient({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.govee.test',
      timeoutMs: 1000,
      maxRetries: 0,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with provided options', () => {
      const customClient = new GoveeClient({
        apiKey: 'custom-key',
        baseUrl: 'https://custom.api',
        timeoutMs: 5000,
      });
      expect(customClient).toBeInstanceOf(GoveeClient);
    });

    it('should use default base URL when not provided', () => {
      const defaultClient = new GoveeClient({ apiKey: 'test-key' });
      expect(defaultClient).toBeInstanceOf(GoveeClient);
    });
  });

  describe('getDevices', () => {
    it('should return devices on successful response (200)', async () => {
      const mockDevices = [
        {
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          deviceName: 'Living Room Light',
          controllable: true,
          retrievable: true,
          supportCmds: ['turn', 'brightness', 'color'],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          code: 200,
          message: 'success',
          data: { devices: mockDevices },
        }),
      });

      const devices = await client.getDevices();

      expect(devices).toEqual(mockDevices);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.govee.test/v1/devices',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Govee-API-Key': 'test-api-key',
          },
        })
      );
    });

    it('should throw GoveeApiError on 400 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_API_ERROR);
      expect(error.goveeCode).toBe(400);
    });

    it('should throw GoveeApiError on 401 response without exposing API key issue', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Invalid API key' }),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_API_ERROR);
      expect(error.message).toBe('Govee API authentication failed');
      // Should NOT contain "API key" in message to avoid exposing sensitive info
      expect(error.message).not.toContain('Invalid API key');
    });

    it('should throw rate limited error on 429 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: 'Too many requests' }),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
      expect(error.statusCode).toBe(503);
      expect(error.goveeCode).toBe(429);
    });

    it('should throw unavailable error on 500 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Internal server error' }),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
      expect(error.statusCode).toBe(502);
    });

    it('should throw unavailable error on 502 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: () => Promise.resolve({}),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });

    it('should throw unavailable error on 503 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
      expect(error.message).toContain('connect');
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
      expect(error.message).toContain('timed out');
    });

    it('should handle JSON parse errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const error = await client.getDevices().catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
    });
  });

  describe('controlDevice', () => {
    it('should send control command successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          code: 200,
          message: 'success',
        }),
      });

      const result = await client.controlDevice({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'turn', value: 'on' },
      });

      expect(result.code).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.govee.test/v1/devices/control',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            device: 'AA:BB:CC:DD:EE:FF',
            model: 'H6160',
            cmd: { name: 'turn', value: 'on' },
          }),
        })
      );
    });

    it('should send brightness command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 200, message: 'success' }),
      });

      await client.controlDevice({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'brightness', value: 75 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"brightness"'),
        })
      );
    });

    it('should send color command', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 200, message: 'success' }),
      });

      await client.controlDevice({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'color', value: { r: 255, g: 0, b: 128 } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"r":255'),
        })
      );
    });

    it('should handle 400 error for invalid control request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid device' }),
      });

      const error = await client.controlDevice({
        device: 'invalid',
        model: 'H6160',
        cmd: { name: 'turn', value: 'on' },
      }).catch((e) => e);

      expect(error).toBeInstanceOf(GoveeApiError);
      expect(error.goveeCode).toBe(400);
    });

    it('should handle 429 rate limit on control request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
      });

      const error = await client.controlDevice({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'turn', value: 'on' },
      }).catch((e) => e);

      expect(error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is reachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          code: 200,
          message: 'success',
          data: { devices: [] },
        }),
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('fromConfig', () => {
    it('should create client from config', () => {
      const config = {
        goveeApiKey: 'config-api-key',
        port: 3000,
        host: '0.0.0.0',
        nodeEnv: 'test' as const,
        mcpClientTokens: [],
        deviceCacheTtlMs: 300000,
        perClientRateLimit: 60,
        rateLimitWindowMs: 60000,
        maxRetries: 3,
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
        coalesceWindowMs: 200,
        logLevel: 'info' as const,
      };

      const clientFromConfig = GoveeClient.fromConfig(config);

      expect(clientFromConfig).toBeInstanceOf(GoveeClient);
    });
  });
});
