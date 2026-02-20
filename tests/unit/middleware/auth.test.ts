import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/server.js';
import { resetConfig, type Config } from '../../../src/config/index.js';
import { authenticate, validateToken } from '../../../src/middleware/auth.js';

describe('Auth Middleware', () => {
  describe('validateToken', () => {
    it('should return true for valid token', () => {
      const result = validateToken('valid-token', ['valid-token']);
      expect(result).toBe(true);
    });

    it('should return false for invalid token', () => {
      const result = validateToken('invalid-token', ['valid-token']);
      expect(result).toBe(false);
    });

    it('should return false for empty token list', () => {
      const result = validateToken('any-token', []);
      expect(result).toBe(false);
    });

    it('should validate against multiple tokens', () => {
      const result = validateToken('token2', ['token1', 'token2', 'token3']);
      expect(result).toBe(true);
    });

    it('should return false when token not in list', () => {
      const result = validateToken('token4', ['token1', 'token2', 'token3']);
      expect(result).toBe(false);
    });

    it('should handle empty string token', () => {
      const result = validateToken('', ['valid-token']);
      expect(result).toBe(false);
    });

    it('should handle matching empty string token', () => {
      const result = validateToken('', ['']);
      expect(result).toBe(true);
    });
  });

  describe('authenticate (integration)', () => {
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

      // Register a protected test route
      server.get('/protected', {
        preHandler: authenticate,
      }, async () => {
        return { message: 'success' };
      });

      await server.ready();
    });

    afterAll(async () => {
      await server.close();
      resetConfig();
    });

    it('should reject request without auth header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('should reject request with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept request with valid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': 'test-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'success' });
    });

    it('should accept request with second valid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': 'another-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ message: 'success' });
    });

    it('should reject request with empty auth header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': '',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should not reveal which token was invalid', async () => {
      const response1 = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': 'wrong-token-1',
        },
      });

      const response2 = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-mcp-auth': 'wrong-token-2',
        },
      });

      // Both should have identical error responses
      expect(response1.json()).toEqual(response2.json());
    });
  });
});
