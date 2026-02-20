import { z } from 'zod';
import type { DeviceService } from './device.service.js';
import type { ControlService } from './control.service.js';
import {
  turnParamsSchema,
  brightnessParamsSchema,
  colorParamsSchema,
} from '../schemas/control.schema.js';
import { mapZodError } from '../utils/errors.js';

export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface Tool {
  id: string;
  description: string;
  input_schema: ToolInputSchema;
}

export interface ToolManifest {
  tools: Tool[];
}

type ToolHandler = (params: unknown) => Promise<ToolResult>;

export class ToolService {
  private readonly deviceService: DeviceService;
  private readonly controlService: ControlService;
  private readonly toolHandlers: Map<string, ToolHandler>;

  constructor(deviceService: DeviceService, controlService: ControlService) {
    this.deviceService = deviceService;
    this.controlService = controlService;
    this.toolHandlers = this.createToolHandlers();
  }

  /**
   * Dispatch and execute a tool call
   */
  async invoke(tool: string, params: unknown): Promise<ToolResult> {
    const handler = this.toolHandlers.get(tool);

    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: `Unknown tool: ${tool}`,
        },
      };
    }

    return handler(params);
  }

  /**
   * Get the tool manifest describing all available tools
   */
  getManifest(): ToolManifest {
    return {
      tools: [
        {
          id: 'turn',
          description: 'Turn a Govee device on or off',
          input_schema: {
            type: 'object',
            properties: {
              device: {
                type: 'string',
                description: 'Device ID (MAC address format). Optional if default device is configured.',
              },
              model: {
                type: 'string',
                description: 'Device model. Optional, will use device model if not specified.',
              },
              power: {
                type: 'string',
                enum: ['on', 'off'],
                description: 'Power state to set',
              },
            },
            required: ['power'],
          },
        },
        {
          id: 'brightness',
          description: 'Set the brightness level of a Govee device',
          input_schema: {
            type: 'object',
            properties: {
              device: {
                type: 'string',
                description: 'Device ID (MAC address format). Optional if default device is configured.',
              },
              model: {
                type: 'string',
                description: 'Device model. Optional, will use device model if not specified.',
              },
              level: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Brightness level (1-100)',
              },
            },
            required: ['level'],
          },
        },
        {
          id: 'color',
          description: 'Set the RGB color of a Govee device',
          input_schema: {
            type: 'object',
            properties: {
              device: {
                type: 'string',
                description: 'Device ID (MAC address format). Optional if default device is configured.',
              },
              model: {
                type: 'string',
                description: 'Device model. Optional, will use device model if not specified.',
              },
              r: {
                type: 'integer',
                minimum: 0,
                maximum: 255,
                description: 'Red value (0-255)',
              },
              g: {
                type: 'integer',
                minimum: 0,
                maximum: 255,
                description: 'Green value (0-255)',
              },
              b: {
                type: 'integer',
                minimum: 0,
                maximum: 255,
                description: 'Blue value (0-255)',
              },
            },
            required: ['r', 'g', 'b'],
          },
        },
        {
          id: 'list_devices',
          description: 'List all Govee devices associated with the account',
          input_schema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  }

  /**
   * Create the map of tool handlers
   */
  private createToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('turn', async (params: unknown) => {
      const parsed = this.validateParams(turnParamsSchema, params);
      if ('error' in parsed) return parsed;
      const result = await this.controlService.turn(parsed.value);
      return this.mapControlResult(result);
    });

    handlers.set('brightness', async (params: unknown) => {
      const parsed = this.validateParams(brightnessParamsSchema, params);
      if ('error' in parsed) return parsed;
      const result = await this.controlService.setBrightness(parsed.value);
      return this.mapControlResult(result);
    });

    handlers.set('color', async (params: unknown) => {
      const parsed = this.validateParams(colorParamsSchema, params);
      if ('error' in parsed) return parsed;
      const result = await this.controlService.setColor(parsed.value);
      return this.mapControlResult(result);
    });

    handlers.set('list_devices', async () => {
      try {
        const result = await this.deviceService.getDevices();
        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof Error) {
          return {
            ok: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: error.message,
            },
          };
        }
        return {
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        };
      }
    });

    return handlers;
  }

  /**
   * Validate params against a Zod schema
   */
  private validateParams<T>(
    schema: z.ZodSchema<T>,
    params: unknown
  ): { ok: true; value: T } | { ok: false; error: { code: string; message: string } } {
    const result = schema.safeParse(params);
    if (!result.success) {
      const validationError = mapZodError(result.error);
      return {
        ok: false,
        error: {
          code: validationError.code,
          message: validationError.message,
        },
      };
    }
    return { ok: true, value: result.data };
  }

  /**
   * Map ControlResult to ToolResult
   */
  private mapControlResult(result: { ok: boolean; goveeResponse?: unknown; error?: { code: string; message: string } }): ToolResult {
    if (result.ok) {
      return {
        ok: true,
        result: result.goveeResponse,
      };
    }
    return {
      ok: false,
      error: result.error,
    };
  }
}
