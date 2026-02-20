import type { Config } from '../config/index.js';
import type { Device } from '../schemas/device.schema.js';
import type { TurnParams, BrightnessParams, ColorParams } from '../schemas/control.schema.js';
import type { GoveeApiResponse, GoveeControlParams, GoveeCommandName } from '../types/index.js';
import type { DeviceService } from './device.service.js';
import type { GoveeClient } from '../clients/govee.client.js';
import { AppError, ErrorCode, NotFoundError } from '../utils/errors.js';

export interface ControlResult {
  ok: boolean;
  goveeResponse?: GoveeApiResponse;
  error?: {
    code: string;
    message: string;
  };
}

export class ControlService {
  private readonly deviceService: DeviceService;
  private readonly goveeClient: GoveeClient;

  constructor(deviceService: DeviceService, goveeClient: GoveeClient, _config: Config) {
    this.deviceService = deviceService;
    this.goveeClient = goveeClient;
  }

  /**
   * Turn device on or off
   */
  async turn(params: TurnParams): Promise<ControlResult> {
    return this.executeCommand('turn', params, params.power);
  }

  /**
   * Set device brightness (1-100)
   */
  async setBrightness(params: BrightnessParams): Promise<ControlResult> {
    return this.executeCommand('brightness', params, params.level);
  }

  /**
   * Set device RGB color
   */
  async setColor(params: ColorParams): Promise<ControlResult> {
    return this.executeCommand('color', params, { r: params.r, g: params.g, b: params.b });
  }

  /**
   * Execute a control command on a device
   */
  private async executeCommand(
    commandName: GoveeCommandName,
    params: { device?: string; model?: string },
    value: string | number | { r: number; g: number; b: number }
  ): Promise<ControlResult> {
    try {
      // Resolve device
      const device = await this.resolveDevice(params.device);

      // Validate device supports the command
      this.validateCommandSupport(device, commandName);

      // Get model from params or device
      const model = params.model ?? device.model;

      // Build control params
      const controlParams: GoveeControlParams = {
        device: device.deviceId,
        model,
        cmd: {
          name: commandName,
          value,
        },
      };

      // Execute command
      const goveeResponse = await this.goveeClient.controlDevice(controlParams);

      return {
        ok: true,
        goveeResponse,
      };
    } catch (error) {
      if (error instanceof AppError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        };
      }

      return {
        ok: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
        },
      };
    }
  }

  /**
   * Resolve device ID to a Device object
   * Priority: provided device ID > default device > error
   */
  private async resolveDevice(deviceId?: string): Promise<Device> {
    // If device ID is provided, look it up
    if (deviceId !== undefined) {
      return this.deviceService.getDeviceOrThrow(deviceId);
    }

    // Try to get default device
    const defaultDevice = await this.deviceService.getDefaultDevice();
    if (defaultDevice !== null) {
      return defaultDevice;
    }

    // No device found
    throw new NotFoundError('No device specified and no default device available');
  }

  /**
   * Validate that device supports the requested command
   */
  private validateCommandSupport(device: Device, command: GoveeCommandName): void {
    // Check if device is controllable
    if (!device.controllable) {
      throw new AppError(
        ErrorCode.DEVICE_NOT_CONTROLLABLE,
        `Device '${device.deviceName}' is not controllable`,
        400,
        { deviceId: device.deviceId }
      );
    }

    // Check if device supports the command
    if (!device.supportedCommands.includes(command)) {
      throw new AppError(
        ErrorCode.COMMAND_NOT_SUPPORTED,
        `Device '${device.deviceName}' does not support the '${command}' command`,
        400,
        {
          deviceId: device.deviceId,
          command,
          supportedCommands: device.supportedCommands,
        }
      );
    }
  }
}
