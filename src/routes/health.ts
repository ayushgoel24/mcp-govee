import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface HealthResponse {
  status: 'ok';
}

interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: {
    govee_api: 'up' | 'down';
  };
}

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get<{
    Reply: HealthResponse;
  }>('/healthz', async (_request: FastifyRequest, _reply: FastifyReply): Promise<HealthResponse> => {
    return { status: 'ok' };
  });

  server.get<{
    Reply: ReadyResponse;
  }>('/ready', async (_request: FastifyRequest, reply: FastifyReply): Promise<ReadyResponse> => {
    // Check Govee API reachability with 5 second timeout
    const goveeApiHealthy = await server.goveeClient.healthCheck();

    const response: ReadyResponse = {
      status: goveeApiHealthy ? 'ready' : 'not_ready',
      checks: {
        govee_api: goveeApiHealthy ? 'up' : 'down',
      },
    };

    if (!goveeApiHealthy) {
      return reply.status(503).send(response);
    }

    return response;
  });
}
