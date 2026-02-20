import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { devicesRoutes } from './devices.js';

/**
 * Register all routes with the Fastify server
 */
export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(healthRoutes);
  await server.register(devicesRoutes);
}

export { healthRoutes } from './health.js';
export { devicesRoutes } from './devices.js';
