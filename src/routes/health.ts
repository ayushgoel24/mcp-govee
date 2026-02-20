import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface HealthResponse {
  status: 'ok';
}

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get<{
    Reply: HealthResponse;
  }>('/healthz', async (_request: FastifyRequest, _reply: FastifyReply): Promise<HealthResponse> => {
    return { status: 'ok' };
  });
}
