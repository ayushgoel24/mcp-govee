import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resetConfig, ConfigurationError, type Config } from '../../src/config/index.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetConfig();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  describe('loadConfig', () => {
    describe('required environment variables', () => {
      it('should throw ConfigurationError when GOVEE_API_KEY is missing', () => {
        delete process.env['GOVEE_API_KEY'];
        expect(() => loadConfig()).toThrow(ConfigurationError);
        expect(() => loadConfig()).toThrow('Missing required environment variable: GOVEE_API_KEY');
      });

      it('should load config when GOVEE_API_KEY is provided', () => {
        process.env['GOVEE_API_KEY'] = 'test-api-key';
        const config = loadConfig();
        expect(config.goveeApiKey).toBe('test-api-key');
      });
    });

    describe('default values', () => {
      beforeEach(() => {
        process.env['GOVEE_API_KEY'] = 'test-api-key';
      });

      it('should use default port 3000', () => {
        const config = loadConfig();
        expect(config.port).toBe(3000);
      });

      it('should use default host 0.0.0.0', () => {
        const config = loadConfig();
        expect(config.host).toBe('0.0.0.0');
      });

      it('should use default nodeEnv development when NODE_ENV is not set', () => {
        delete process.env['NODE_ENV'];
        const config = loadConfig();
        expect(config.nodeEnv).toBe('development');
      });

      it('should use default deviceCacheTtlMs 300000', () => {
        const config = loadConfig();
        expect(config.deviceCacheTtlMs).toBe(300000);
      });

      it('should use default perClientRateLimit 60', () => {
        const config = loadConfig();
        expect(config.perClientRateLimit).toBe(60);
      });

      it('should use default rateLimitWindowMs 60000', () => {
        const config = loadConfig();
        expect(config.rateLimitWindowMs).toBe(60000);
      });

      it('should use default maxRetries 3', () => {
        const config = loadConfig();
        expect(config.maxRetries).toBe(3);
      });

      it('should use default initialBackoffMs 1000', () => {
        const config = loadConfig();
        expect(config.initialBackoffMs).toBe(1000);
      });

      it('should use default maxBackoffMs 10000', () => {
        const config = loadConfig();
        expect(config.maxBackoffMs).toBe(10000);
      });

      it('should use default coalesceWindowMs 200', () => {
        const config = loadConfig();
        expect(config.coalesceWindowMs).toBe(200);
      });

      it('should use default logLevel info', () => {
        const config = loadConfig();
        expect(config.logLevel).toBe('info');
      });

      it('should have undefined defaultDeviceId by default', () => {
        const config = loadConfig();
        expect(config.defaultDeviceId).toBeUndefined();
      });

      it('should have empty mcpClientTokens by default', () => {
        const config = loadConfig();
        expect(config.mcpClientTokens).toEqual([]);
      });
    });

    describe('custom values', () => {
      beforeEach(() => {
        process.env['GOVEE_API_KEY'] = 'test-api-key';
      });

      it('should parse custom port', () => {
        process.env['PORT'] = '8080';
        const config = loadConfig();
        expect(config.port).toBe(8080);
      });

      it('should parse custom host', () => {
        process.env['HOST'] = '127.0.0.1';
        const config = loadConfig();
        expect(config.host).toBe('127.0.0.1');
      });

      it('should parse NODE_ENV production', () => {
        process.env['NODE_ENV'] = 'production';
        const config = loadConfig();
        expect(config.nodeEnv).toBe('production');
      });

      it('should parse NODE_ENV test', () => {
        process.env['NODE_ENV'] = 'test';
        const config = loadConfig();
        expect(config.nodeEnv).toBe('test');
      });

      it('should parse MCP_CLIENT_TOKENS as comma-separated list', () => {
        process.env['MCP_CLIENT_TOKENS'] = 'token1,token2,token3';
        const config = loadConfig();
        expect(config.mcpClientTokens).toEqual(['token1', 'token2', 'token3']);
      });

      it('should trim whitespace from MCP_CLIENT_TOKENS', () => {
        process.env['MCP_CLIENT_TOKENS'] = ' token1 , token2 , token3 ';
        const config = loadConfig();
        expect(config.mcpClientTokens).toEqual(['token1', 'token2', 'token3']);
      });

      it('should filter empty tokens from MCP_CLIENT_TOKENS', () => {
        process.env['MCP_CLIENT_TOKENS'] = 'token1,,token2,  ,token3';
        const config = loadConfig();
        expect(config.mcpClientTokens).toEqual(['token1', 'token2', 'token3']);
      });

      it('should parse custom DEFAULT_DEVICE_ID', () => {
        process.env['DEFAULT_DEVICE_ID'] = 'AA:BB:CC:DD:EE:FF';
        const config = loadConfig();
        expect(config.defaultDeviceId).toBe('AA:BB:CC:DD:EE:FF');
      });

      it('should parse custom LOG_LEVEL', () => {
        process.env['LOG_LEVEL'] = 'debug';
        const config = loadConfig();
        expect(config.logLevel).toBe('debug');
      });

      it('should parse custom DEVICE_CACHE_TTL_MS', () => {
        process.env['DEVICE_CACHE_TTL_MS'] = '600000';
        const config = loadConfig();
        expect(config.deviceCacheTtlMs).toBe(600000);
      });
    });

    describe('validation', () => {
      beforeEach(() => {
        process.env['GOVEE_API_KEY'] = 'test-api-key';
      });

      it('should throw ConfigurationError for invalid NODE_ENV', () => {
        process.env['NODE_ENV'] = 'invalid';
        expect(() => loadConfig()).toThrow(ConfigurationError);
        expect(() => loadConfig()).toThrow("Invalid NODE_ENV: invalid. Must be 'development', 'production', or 'test'");
      });

      it('should throw ConfigurationError for invalid LOG_LEVEL', () => {
        process.env['LOG_LEVEL'] = 'invalid';
        expect(() => loadConfig()).toThrow(ConfigurationError);
        expect(() => loadConfig()).toThrow("Invalid LOG_LEVEL: invalid. Must be 'debug', 'info', 'warn', or 'error'");
      });

      it('should throw ConfigurationError for non-numeric PORT', () => {
        process.env['PORT'] = 'not-a-number';
        expect(() => loadConfig()).toThrow(ConfigurationError);
        expect(() => loadConfig()).toThrow('Environment variable PORT must be a number');
      });

      it('should throw ConfigurationError for non-numeric DEVICE_CACHE_TTL_MS', () => {
        process.env['DEVICE_CACHE_TTL_MS'] = 'abc';
        expect(() => loadConfig()).toThrow(ConfigurationError);
        expect(() => loadConfig()).toThrow('Environment variable DEVICE_CACHE_TTL_MS must be a number');
      });
    });
  });
});
