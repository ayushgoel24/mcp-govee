import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DeviceListResult } from '../schemas/device.schema.js';
import { authenticate } from '../middleware/auth.js';

interface DevicesResponse {
  ok: true;
  result: DeviceListResult;
}

export async function devicesRoutes(server: FastifyInstance): Promise<void> {
  server.get<{
    Reply: DevicesResponse;
  }>(
    '/devices',
    {
      preHandler: authenticate,
    },
    async (_request: FastifyRequest, _reply: FastifyReply): Promise<DevicesResponse> => {
      const deviceService = server.deviceService;
      const result = await deviceService.getDevices();

      return {
        ok: true,
        result,
      };
    }
  );
}
