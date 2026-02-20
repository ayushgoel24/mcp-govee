import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';

describe('Manifest Routes', () => {
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

  describe('GET /manifest', () => {
    it('should return 200 with tool manifest', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('tools');
      expect(Array.isArray(body.tools)).toBe(true);
    });

    it('should return JSON content type', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should not require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include turn tool with correct schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      const body = response.json();
      const turnTool = body.tools.find((t: { id: string }) => t.id === 'turn');

      expect(turnTool).toBeDefined();
      expect(turnTool.description).toBe('Turn a Govee device on or off');
      expect(turnTool.input_schema.type).toBe('object');
      expect(turnTool.input_schema.properties.power).toBeDefined();
      expect(turnTool.input_schema.properties.power.enum).toEqual(['on', 'off']);
      expect(turnTool.input_schema.required).toContain('power');
    });

    it('should include brightness tool with correct schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      const body = response.json();
      const brightnessTool = body.tools.find((t: { id: string }) => t.id === 'brightness');

      expect(brightnessTool).toBeDefined();
      expect(brightnessTool.description).toBe('Set the brightness level of a Govee device');
      expect(brightnessTool.input_schema.properties.level).toBeDefined();
      expect(brightnessTool.input_schema.properties.level.minimum).toBe(1);
      expect(brightnessTool.input_schema.properties.level.maximum).toBe(100);
      expect(brightnessTool.input_schema.required).toContain('level');
    });

    it('should include color tool with correct schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      const body = response.json();
      const colorTool = body.tools.find((t: { id: string }) => t.id === 'color');

      expect(colorTool).toBeDefined();
      expect(colorTool.description).toBe('Set the RGB color of a Govee device');
      expect(colorTool.input_schema.properties.r).toBeDefined();
      expect(colorTool.input_schema.properties.g).toBeDefined();
      expect(colorTool.input_schema.properties.b).toBeDefined();
      expect(colorTool.input_schema.properties.r.minimum).toBe(0);
      expect(colorTool.input_schema.properties.r.maximum).toBe(255);
      expect(colorTool.input_schema.required).toEqual(['r', 'g', 'b']);
    });

    it('should include list_devices tool with correct schema', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      const body = response.json();
      const listDevicesTool = body.tools.find((t: { id: string }) => t.id === 'list_devices');

      expect(listDevicesTool).toBeDefined();
      expect(listDevicesTool.description).toBe('List all Govee devices associated with the account');
      expect(listDevicesTool.input_schema.type).toBe('object');
    });

    it('should include all four tools', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/manifest',
      });

      const body = response.json();
      const toolIds = body.tools.map((t: { id: string }) => t.id);

      expect(toolIds).toContain('turn');
      expect(toolIds).toContain('brightness');
      expect(toolIds).toContain('color');
      expect(toolIds).toContain('list_devices');
      expect(body.tools.length).toBe(4);
    });
  });
});
