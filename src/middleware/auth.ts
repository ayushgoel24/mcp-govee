import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { getConfig } from '../config/index.js';

const AUTH_HEADER = 'x-mcp-auth';

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

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getConfig();
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

  if (!validateToken(authHeader, config.mcpClientTokens)) {
    return reply.code(401).send({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }
}
