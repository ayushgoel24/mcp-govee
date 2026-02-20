import { describe, it, expect } from 'vitest';
import { createServer } from '../../src/server.js';
import type { Config } from '../../src/config/index.js';

describe('Graceful Shutdown', () => {
  const mockConfig: Config = {
    port: 3000,
    host: '127.0.0.1',
    nodeEnv: 'test',
    goveeApiKey: 'test-api-key',
    mcpClientTokens: [],
    deviceCacheTtlMs: 300000,
    perClientRateLimit: 100,
    rateLimitWindowMs: 60000,
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    coalesceWindowMs: 200,
    logLevel: 'silent',
  };

  describe('server.close()', () => {
    it('should close the server gracefully', async () => {
      const server = createServer({ config: mockConfig });
      await server.listen({ port: 0 }); // Use port 0 for random available port

      // Server should be listening
      const address = server.addresses();
      expect(address.length).toBeGreaterThan(0);

      // Close the server
      await server.close();

      // Server should no longer have addresses
      expect(server.addresses()).toHaveLength(0);
    });

    it('should handle close when server is not started', async () => {
      const server = createServer({ config: mockConfig });

      // Should not throw when closing a server that was never started
      await expect(server.close()).resolves.not.toThrow();
    });

    it('should handle multiple close calls', async () => {
      const server = createServer({ config: mockConfig });
      await server.listen({ port: 0 });

      // Multiple close calls should be safe
      await server.close();
      await expect(server.close()).resolves.not.toThrow();
    });
  });

  describe('shutdown with in-flight requests', () => {
    it('should wait for in-flight requests to complete', async () => {
      const server = createServer({ config: mockConfig });

      // Add a slow route for testing
      server.get('/slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { status: 'completed' };
      });

      await server.listen({ port: 0 });
      const address = server.addresses()[0];
      const port = typeof address === 'object' ? address.port : 0;

      // Start a request (don't await)
      const requestPromise = fetch(`http://127.0.0.1:${port}/slow`);

      // Give request time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start shutdown
      const closePromise = server.close();

      // Both should complete successfully
      const [response] = await Promise.all([requestPromise, closePromise]);

      expect(response.ok).toBe(true);
      const body = await response.json();
      expect(body.status).toBe('completed');
    });
  });

  describe('deviceService cache invalidation', () => {
    it('should have deviceService available for cache invalidation', () => {
      const server = createServer({ config: mockConfig });

      // Verify deviceService is decorated on the server
      expect(server.deviceService).toBeDefined();
      expect(typeof server.deviceService.invalidateCache).toBe('function');
    });

    it('should invalidate cache successfully', () => {
      const server = createServer({ config: mockConfig });

      // Should not throw when invalidating cache
      expect(() => server.deviceService.invalidateCache()).not.toThrow();
    });
  });

  describe('shutdown timeout behavior', () => {
    it('should complete shutdown within timeout', async () => {
      const server = createServer({ config: mockConfig });
      await server.listen({ port: 0 });

      const startTime = Date.now();
      await server.close();
      const elapsed = Date.now() - startTime;

      // Shutdown should complete quickly (well under the 30s timeout)
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
