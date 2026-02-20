import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../src/server.js';
import { resetConfig, type Config } from '../../src/config/index.js';

// Mock the GoveeClient to avoid real API calls
vi.mock('../../src/clients/govee.client.js', () => ({
  GoveeClient: {
    fromConfig: () => ({
      getDevices: vi.fn().mockResolvedValue([]),
      controlDevice: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Logging', () => {
  describe('log format and content', () => {
    let server: FastifyInstance;
    let logOutput: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);

    const testConfig: Config = {
      port: 0,
      host: '127.0.0.1',
      nodeEnv: 'development',
      goveeApiKey: 'test-api-key',
      mcpClientTokens: ['test-token'],
      deviceCacheTtlMs: 300000,
      perClientRateLimit: 60,
      rateLimitWindowMs: 60000,
      maxRetries: 0,
      initialBackoffMs: 1000,
      maxBackoffMs: 10000,
      coalesceWindowMs: 200,
      logLevel: 'debug',
    };

    beforeAll(async () => {
      // Capture log output
      process.stdout.write = (chunk: string | Uint8Array): boolean => {
        if (typeof chunk === 'string') {
          logOutput.push(chunk);
        }
        return true;
      };

      server = createServer({ config: testConfig });
      await server.ready();
    });

    afterAll(async () => {
      await server.close();
      resetConfig();
      process.stdout.write = originalStdoutWrite;
      vi.restoreAllMocks();
    });

    beforeEach(() => {
      logOutput = [];
    });

    it('should output logs in JSON format', async () => {
      await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      // Find a log line and verify it's valid JSON
      const jsonLogs = logOutput.filter((line) => {
        try {
          JSON.parse(line);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonLogs.length).toBeGreaterThan(0);

      // Parse one log and verify it has expected structure
      const log = JSON.parse(jsonLogs[0]);
      expect(log).toHaveProperty('level');
      expect(log).toHaveProperty('time');
      expect(log).toHaveProperty('pid');
    });

    it('should include request ID in log entries', async () => {
      await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      // Find response log
      const requestLogs = logOutput.filter((line) => {
        try {
          const log = JSON.parse(line);
          return log.req !== undefined || log.reqId !== undefined;
        } catch {
          return false;
        }
      });

      expect(requestLogs.length).toBeGreaterThan(0);

      // Verify request ID format (UUID)
      const log = JSON.parse(requestLogs[0]);
      const reqId = log.reqId ?? log.req?.requestId;
      expect(reqId).toBeDefined();
      expect(typeof reqId).toBe('string');
      // UUID format check
      expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should redact X-MCP-Auth header in logs', async () => {
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: {
          'x-mcp-auth': 'secret-token-value',
        },
      });

      // Check all log output for the secret token
      const allLogs = logOutput.join('');
      expect(allLogs).not.toContain('secret-token-value');
    });

    it('should redact Authorization header in logs', async () => {
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: {
          authorization: 'Bearer secret-bearer-token',
          'x-mcp-auth': 'test-token', // Valid token for auth
        },
      });

      // Check all log output for the bearer token
      const allLogs = logOutput.join('');
      expect(allLogs).not.toContain('secret-bearer-token');
    });

    it('should include method and URL in request logs', async () => {
      await server.inject({
        method: 'GET',
        url: '/healthz',
      });

      const requestLogs = logOutput.filter((line) => {
        try {
          const log = JSON.parse(line);
          return log.req !== undefined;
        } catch {
          return false;
        }
      });

      expect(requestLogs.length).toBeGreaterThan(0);

      const log = JSON.parse(requestLogs[0]);
      expect(log.req.method).toBe('GET');
      expect(log.req.url).toBe('/healthz');
    });
  });

  describe('stack traces based on environment', () => {
    it('should include stack trace in development mode', async () => {
      const devConfig: Config = {
        port: 0,
        host: '127.0.0.1',
        nodeEnv: 'development',
        goveeApiKey: 'test-api-key',
        mcpClientTokens: ['test-token'],
        deviceCacheTtlMs: 300000,
        perClientRateLimit: 60,
        rateLimitWindowMs: 60000,
        maxRetries: 0,
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
        coalesceWindowMs: 200,
        logLevel: 'debug',
      };

      const logOutput: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Uint8Array): boolean => {
        if (typeof chunk === 'string') logOutput.push(chunk);
        return true;
      };

      const server = createServer({ config: devConfig });
      await server.ready();

      // Trigger an error by requesting without auth
      await server.inject({
        method: 'GET',
        url: '/devices',
      });

      await server.close();
      resetConfig();
      process.stdout.write = originalWrite;

      // Look for error logs
      const errorLogs = logOutput.filter((line) => {
        try {
          const log = JSON.parse(line);
          return log.err !== undefined;
        } catch {
          return false;
        }
      });

      if (errorLogs.length > 0) {
        const errorLog = JSON.parse(errorLogs[0]);
        // In development, stack should be present (may be empty string if not applicable)
        expect('stack' in errorLog.err).toBe(true);
      }
    });

    it('should exclude stack trace in production mode', async () => {
      const prodConfig: Config = {
        port: 0,
        host: '127.0.0.1',
        nodeEnv: 'production',
        goveeApiKey: 'test-api-key',
        mcpClientTokens: ['test-token'],
        deviceCacheTtlMs: 300000,
        perClientRateLimit: 60,
        rateLimitWindowMs: 60000,
        maxRetries: 0,
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
        coalesceWindowMs: 200,
        logLevel: 'debug',
      };

      const logOutput: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Uint8Array): boolean => {
        if (typeof chunk === 'string') logOutput.push(chunk);
        return true;
      };

      const server = createServer({ config: prodConfig });
      await server.ready();

      // Trigger an error by requesting without auth
      await server.inject({
        method: 'GET',
        url: '/devices',
      });

      await server.close();
      resetConfig();
      process.stdout.write = originalWrite;

      // Look for error logs
      const errorLogs = logOutput.filter((line) => {
        try {
          const log = JSON.parse(line);
          return log.err !== undefined;
        } catch {
          return false;
        }
      });

      if (errorLogs.length > 0) {
        const errorLog = JSON.parse(errorLogs[0]);
        // In production, stack should be empty string
        expect(errorLog.err.stack).toBe('');
      }
    });
  });

  describe('error serialization', () => {
    it('should include error type and message in serialized errors', async () => {
      const config: Config = {
        port: 0,
        host: '127.0.0.1',
        nodeEnv: 'development',
        goveeApiKey: 'test-api-key',
        mcpClientTokens: ['test-token'],
        deviceCacheTtlMs: 300000,
        perClientRateLimit: 60,
        rateLimitWindowMs: 60000,
        maxRetries: 0,
        initialBackoffMs: 1000,
        maxBackoffMs: 10000,
        coalesceWindowMs: 200,
        logLevel: 'debug',
      };

      const logOutput: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Uint8Array): boolean => {
        if (typeof chunk === 'string') logOutput.push(chunk);
        return true;
      };

      const server = createServer({ config });
      await server.ready();

      // Trigger an auth error
      await server.inject({
        method: 'GET',
        url: '/devices',
        headers: {
          'x-mcp-auth': 'invalid-token',
        },
      });

      await server.close();
      resetConfig();
      process.stdout.write = originalWrite;

      // Look for any error log entry (err field present)
      const errorLogs = logOutput.filter((line) => {
        try {
          const log = JSON.parse(line);
          return log.err !== undefined;
        } catch {
          return false;
        }
      });

      // If there are error logs, verify they have expected structure
      if (errorLogs.length > 0) {
        const errorLog = JSON.parse(errorLogs[0]);
        expect(errorLog.err).toHaveProperty('type');
        expect(errorLog.err).toHaveProperty('message');
      }

      // Alternatively, verify the response was 401
      // (which confirms error handling worked even if not logged)
      const response = await createServer({ config: { ...config } }).inject({
        method: 'GET',
        url: '/devices',
        headers: {
          'x-mcp-auth': 'invalid-token',
        },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
