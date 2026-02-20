import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

const AUTH_HEADER = 'x-mcp-auth';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitPluginOptions {
  limit: number;
  windowMs: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    rateLimitStore: Map<string, RateLimitEntry>;
    rateLimitConfig: RateLimitPluginOptions;
  }
}

async function rateLimitPluginImpl(
  fastify: FastifyInstance,
  options: RateLimitPluginOptions
): Promise<void> {
  const store = new Map<string, RateLimitEntry>();

  fastify.decorate('rateLimitStore', store);
  fastify.decorate('rateLimitConfig', options);

  // Cleanup expired entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, options.windowMs);

  // Clean up on server close
  fastify.addHook('onClose', async () => {
    clearInterval(cleanupInterval);
  });
}

export const rateLimitPlugin = fp(rateLimitPluginImpl, {
  name: 'rate-limit-plugin',
});

export async function rateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { rateLimitStore: store, rateLimitConfig: config } = request.server;
  const now = Date.now();

  // Use client token as the rate limit key
  const authHeader = request.headers[AUTH_HEADER];
  const clientKey = typeof authHeader === 'string' && authHeader !== ''
    ? authHeader
    : request.ip; // Fall back to IP for unauthenticated requests

  let entry = store.get(clientKey);

  // Reset if window has passed
  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    store.set(clientKey, entry);
  }

  entry.count++;

  // Set rate limit headers
  const remaining = Math.max(0, config.limit - entry.count);
  const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);

  void reply.header('X-RateLimit-Limit', config.limit);
  void reply.header('X-RateLimit-Remaining', remaining);
  void reply.header('X-RateLimit-Reset', resetInSeconds);

  if (entry.count > config.limit) {
    void reply.header('Retry-After', resetInSeconds);
    return reply.code(429).send({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${resetInSeconds} seconds.`,
      },
    });
  }
}
