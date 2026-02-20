import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import fp from 'fastify-plugin';

const AUTH_HEADER = 'x-mcp-auth';

declare module 'fastify' {
  interface FastifyInstance {
    mcpClientTokens: string[];
  }
}

function constantTimeCompare(a: string, b: string): boolean {
  try {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');

    if (bufferA.length !== bufferB.length) {
      // Still perform comparison to maintain constant time
      timingSafeEqual(bufferA, bufferA);
      return false;
    }

    return timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

export function validateToken(token: string, validTokens: string[]): boolean {
  if (validTokens.length === 0) {
    return false;
  }

  for (const validToken of validTokens) {
    if (constantTimeCompare(token, validToken)) {
      return true;
    }
  }

  return false;
}

export interface AuthPluginOptions {
  tokens: string[];
}

async function authPluginImpl(fastify: FastifyInstance, options: AuthPluginOptions): Promise<void> {
  fastify.decorate('mcpClientTokens', options.tokens);
}

export const authPlugin = fp(authPluginImpl, {
  name: 'auth-plugin',
});

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tokens = request.server.mcpClientTokens;
  const authHeader = request.headers[AUTH_HEADER];

  if (typeof authHeader !== 'string' || authHeader === '') {
    return reply.code(401).send({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  if (!validateToken(authHeader, tokens)) {
    return reply.code(401).send({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }
}
