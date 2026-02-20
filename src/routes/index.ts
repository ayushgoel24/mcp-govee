import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { devicesRoutes } from './devices.js';
import { mcpRoutes } from './mcp.js';
import { manifestRoutes } from './manifest.js';

/**
 * Register all routes with the Fastify server
 */
export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(healthRoutes);
  await server.register(devicesRoutes);
  await server.register(mcpRoutes);
  await server.register(manifestRoutes);
}

export { healthRoutes } from './health.js';
export { devicesRoutes } from './devices.js';
export { mcpRoutes } from './mcp.js';
export { manifestRoutes } from './manifest.js';
