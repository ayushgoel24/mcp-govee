import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import type { GoveeDevice } from '../../../src/types/index.js';

// Mock the GoveeClient
const mockGetDevices = vi.fn();
const mockControlDevice = vi.fn();

vi.mock('../../../src/clients/govee.client.js', () => ({
  GoveeClient: {
    fromConfig: () => ({
      getDevices: mockGetDevices,
      controlDevice: mockControlDevice,
      healthCheck: vi.fn(),
    }),
  },
}));

describe('MCP Routes', () => {
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

  const mockGoveeDevices: GoveeDevice[] = [
    {
      device: 'AA:BB:CC:DD:EE:FF',
      model: 'H6160',
      deviceName: 'Living Room Light',
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

  describe('POST /mcp/invoke', () => {
    describe('authentication', () => {
      it('should return 401 when no auth header is provided', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          payload: { tool: 'list_devices', params: {} },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
          },
        });
      });

      it('should return 401 when invalid token is provided', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'invalid-token' },
          payload: { tool: 'list_devices', params: {} },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('validation', () => {
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

      it('should return error for invalid tool name', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: { tool: 'invalid_tool', params: {} },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });
    });

    describe('list_devices tool', () => {
      it('should return device list', async () => {
        mockGetDevices.mockResolvedValueOnce(mockGoveeDevices);

        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: { tool: 'list_devices', params: {} },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(body.result.devices).toHaveLength(1);
      });
    });

    describe('turn tool', () => {
      it('should turn device on', async () => {
        mockGetDevices.mockResolvedValue(mockGoveeDevices);
        mockControlDevice.mockResolvedValue({ code: 200, message: 'success' });

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
        expect(body.ok).toBe(true);
        expect(mockControlDevice).toHaveBeenCalledWith({
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          cmd: { name: 'turn', value: 'on' },
        });
      });

      it('should turn device off', async () => {
        mockGetDevices.mockResolvedValue(mockGoveeDevices);
        mockControlDevice.mockResolvedValue({ code: 200, message: 'success' });

        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'turn',
            params: { device: 'AA:BB:CC:DD:EE:FF', power: 'off' },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
      });

      it('should return error for invalid power value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'turn',
            params: { device: 'AA:BB:CC:DD:EE:FF', power: 'invalid' },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });

      it('should return error for missing power parameter', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'turn',
            params: { device: 'AA:BB:CC:DD:EE:FF' },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });
    });

    describe('brightness tool', () => {
      it('should set brightness level', async () => {
        mockGetDevices.mockResolvedValue(mockGoveeDevices);
        mockControlDevice.mockResolvedValue({ code: 200, message: 'success' });

        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'brightness',
            params: { device: 'AA:BB:CC:DD:EE:FF', level: 50 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(mockControlDevice).toHaveBeenCalledWith({
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          cmd: { name: 'brightness', value: 50 },
        });
      });

      it('should return error for level below minimum', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'brightness',
            params: { device: 'AA:BB:CC:DD:EE:FF', level: 0 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });

      it('should return error for level above maximum', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'brightness',
            params: { device: 'AA:BB:CC:DD:EE:FF', level: 101 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });
    });

    describe('color tool', () => {
      it('should set RGB color', async () => {
        mockGetDevices.mockResolvedValue(mockGoveeDevices);
        mockControlDevice.mockResolvedValue({ code: 200, message: 'success' });

        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'color',
            params: { device: 'AA:BB:CC:DD:EE:FF', r: 255, g: 128, b: 64 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(true);
        expect(mockControlDevice).toHaveBeenCalledWith({
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          cmd: { name: 'color', value: { r: 255, g: 128, b: 64 } },
        });
      });

      it('should return error for missing color components', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'color',
            params: { device: 'AA:BB:CC:DD:EE:FF', r: 255, g: 128 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });

      it('should return error for color value out of range', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'color',
            params: { device: 'AA:BB:CC:DD:EE:FF', r: 256, g: 128, b: 64 },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('INVALID_REQUEST');
      });
    });

    describe('device errors', () => {
      it('should return error when device not found', async () => {
        mockGetDevices.mockResolvedValue(mockGoveeDevices);

        const response = await server.inject({
          method: 'POST',
          url: '/mcp/invoke',
          headers: { 'x-mcp-auth': 'test-token' },
          payload: {
            tool: 'turn',
            params: { device: '00:00:00:00:00:00', power: 'on' },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe('DEVICE_NOT_FOUND');
      });
    });
  });
});
