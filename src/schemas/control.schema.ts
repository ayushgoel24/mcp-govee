import { z } from 'zod';

const deviceIdRegex = /^[A-Fa-f0-9:]+$/;

export const turnParamsSchema = z.object({
  device: z.string().regex(deviceIdRegex, 'Device ID must be a valid MAC address format').optional(),
  model: z.string().max(50, 'Model must be at most 50 characters').optional(),
  power: z.enum(['on', 'off'], {
    errorMap: () => ({ message: "Power must be 'on' or 'off'" }),
  }),
}).strict();

export type TurnParams = z.infer<typeof turnParamsSchema>;

export const brightnessParamsSchema = z.object({
  device: z.string().regex(deviceIdRegex, 'Device ID must be a valid MAC address format').optional(),
  model: z.string().max(50, 'Model must be at most 50 characters').optional(),
  level: z.number().int('Brightness level must be an integer').min(1, 'Brightness level must be at least 1').max(100, 'Brightness level must be at most 100'),
}).strict();

export type BrightnessParams = z.infer<typeof brightnessParamsSchema>;

export const colorParamsSchema = z.object({
  device: z.string().regex(deviceIdRegex, 'Device ID must be a valid MAC address format').optional(),
  model: z.string().max(50, 'Model must be at most 50 characters').optional(),
  r: z.number().int('Red value must be an integer').min(0, 'Red value must be at least 0').max(255, 'Red value must be at most 255'),
  g: z.number().int('Green value must be an integer').min(0, 'Green value must be at least 0').max(255, 'Green value must be at most 255'),
  b: z.number().int('Blue value must be an integer').min(0, 'Blue value must be at least 0').max(255, 'Blue value must be at most 255'),
}).strict();

export type ColorParams = z.infer<typeof colorParamsSchema>;

export const mcpInvokeSchema = z.object({
  tool: z.enum(['turn', 'brightness', 'color', 'list_devices'], {
    errorMap: () => ({ message: "Invalid tool. Must be 'turn', 'brightness', 'color', or 'list_devices'" }),
  }),
  params: z.record(z.unknown()).optional().default({}),
}).strict();

export type McpInvokeRequest = z.infer<typeof mcpInvokeSchema>;
