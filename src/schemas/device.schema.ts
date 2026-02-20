import { z } from 'zod';

export const supportedCommandSchema = z.enum(['turn', 'brightness', 'color', 'colorTem']);

export type SupportedCommand = z.infer<typeof supportedCommandSchema>;

export const deviceSchema = z.object({
  deviceId: z.string(),
  model: z.string(),
  deviceName: z.string(),
  controllable: z.boolean(),
  retrievable: z.boolean(),
  supportedCommands: z.array(supportedCommandSchema),
});

export type Device = z.infer<typeof deviceSchema>;

export const deviceListResultSchema = z.object({
  devices: z.array(deviceSchema),
  cached: z.boolean(),
  cacheAge: z.number().optional(),
});

export type DeviceListResult = z.infer<typeof deviceListResultSchema>;
