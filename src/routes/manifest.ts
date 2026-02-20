import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ToolManifest } from '../services/tool.service.js';

export async function manifestRoutes(server: FastifyInstance): Promise<void> {
  server.get<{
    Reply: ToolManifest;
  }>('/manifest', async (_request: FastifyRequest, _reply: FastifyReply): Promise<ToolManifest> => {
    // Return tool manifest without requiring authentication
    return server.toolService.getManifest();
  });
}
