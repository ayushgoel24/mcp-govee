import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

const REQUEST_ID_HEADER = 'x-request-id';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export async function requestIdPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('correlationId', '');

  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Use incoming X-Request-Id header if provided, otherwise use Fastify's generated ID
    const incomingId = request.headers[REQUEST_ID_HEADER];
    request.correlationId = typeof incomingId === 'string' && incomingId !== ''
      ? incomingId
      : request.id;
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    // Include correlation ID in response headers
    void reply.header(REQUEST_ID_HEADER, request.correlationId);
  });
}

export function getCorrelationId(request: FastifyRequest): string {
  return request.correlationId;
}
