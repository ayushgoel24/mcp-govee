import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ControlService } from '../../../src/services/control.service.js';
import { DeviceService } from '../../../src/services/device.service.js';
import { GoveeClient } from '../../../src/clients/govee.client.js';
import type { Device } from '../../../src/schemas/device.schema.js';
import type { Config } from '../../../src/config/index.js';
import { NotFoundError, AppError, ErrorCode } from '../../../src/utils/errors.js';

describe('ControlService', () => {
  let mockDeviceService: {
    getDeviceOrThrow: ReturnType<typeof vi.fn>;
    getDefaultDevice: ReturnType<typeof vi.fn>;
  };
  let mockGoveeClient: {
    controlDevice: ReturnType<typeof vi.fn>;
  };
  let service: ControlService;
  let config: Config;

  const mockDevice: Device = {
    deviceId: 'AA:BB:CC:DD:EE:FF',
    model: 'H6160',
    deviceName: 'Living Room Light',
    controllable: true,
    retrievable: true,
    supportedCommands: ['turn', 'brightness', 'color'],
  };

  const mockDeviceNoBrightness: Device = {
    deviceId: '11:22:33:44:55:66',
    model: 'H6141',
    deviceName: 'Simple Light',
    controllable: true,
    retrievable: true,
    supportedCommands: ['turn'],
  };

  const mockNonControllableDevice: Device = {
    deviceId: '77:88:99:AA:BB:CC',
    model: 'H6003',
    deviceName: 'Non-controllable',
    controllable: false,
    retrievable: true,
    supportedCommands: [],
  };

  beforeEach(() => {
    mockDeviceService = {
      getDeviceOrThrow: vi.fn(),
      getDefaultDevice: vi.fn(),
    };

    mockGoveeClient = {
      controlDevice: vi.fn(),
    };

    config = {
      port: 3000,
      host: '0.0.0.0',
      nodeEnv: 'test',
      goveeApiKey: 'test-key',
      mcpClientTokens: [],
      deviceCacheTtlMs: 300000,
      perClientRateLimit: 60,
      rateLimitWindowMs: 60000,
      maxRetries: 3,
      initialBackoffMs: 1000,
      maxBackoffMs: 10000,
      coalesceWindowMs: 200,
      logLevel: 'info',
    };

    service = new ControlService(
      mockDeviceService as unknown as DeviceService,
      mockGoveeClient as unknown as GoveeClient,
      config
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('turn', () => {
    it('should turn device on', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const result = await service.turn({ device: 'AA:BB:CC:DD:EE:FF', power: 'on' });

      expect(result.ok).toBe(true);
      expect(result.goveeResponse).toEqual({ code: 200, message: 'success' });
      expect(mockGoveeClient.controlDevice).toHaveBeenCalledWith({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'turn', value: 'on' },
      });
    });

    it('should turn device off', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const result = await service.turn({ device: 'AA:BB:CC:DD:EE:FF', power: 'off' });

      expect(result.ok).toBe(true);
      expect(mockGoveeClient.controlDevice).toHaveBeenCalledWith({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'turn', value: 'off' },
      });
    });

    it('should use default device when device ID not provided', async () => {
      mockDeviceService.getDefaultDevice.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const result = await service.turn({ power: 'on' });

      expect(result.ok).toBe(true);
      expect(mockDeviceService.getDefaultDevice).toHaveBeenCalled();
      expect(mockDeviceService.getDeviceOrThrow).not.toHaveBeenCalled();
    });

    it('should return error when device not found', async () => {
      mockDeviceService.getDeviceOrThrow.mockRejectedValue(
        new NotFoundError('Device not found: XX:XX:XX:XX:XX:XX')
      );

      const result = await service.turn({ device: 'XX:XX:XX:XX:XX:XX', power: 'on' });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
    });

    it('should return error when no default device available', async () => {
      mockDeviceService.getDefaultDevice.mockResolvedValue(null);

      const result = await service.turn({ power: 'on' });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
    });

    it('should use provided model over device model', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      await service.turn({ device: 'AA:BB:CC:DD:EE:FF', model: 'CustomModel', power: 'on' });

      expect(mockGoveeClient.controlDevice).toHaveBeenCalledWith({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'CustomModel',
        cmd: { name: 'turn', value: 'on' },
      });
    });
  });

  describe('setBrightness', () => {
    it('should set brightness level', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const result = await service.setBrightness({ device: 'AA:BB:CC:DD:EE:FF', level: 50 });

      expect(result.ok).toBe(true);
      expect(mockGoveeClient.controlDevice).toHaveBeenCalledWith({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'brightness', value: 50 },
      });
    });

    it('should return error when device does not support brightness', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDeviceNoBrightness);

      const result = await service.setBrightness({ device: '11:22:33:44:55:66', level: 50 });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.COMMAND_NOT_SUPPORTED);
    });
  });

  describe('setColor', () => {
    it('should set RGB color', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDevice);
      mockGoveeClient.controlDevice.mockResolvedValue({ code: 200, message: 'success' });

      const result = await service.setColor({ device: 'AA:BB:CC:DD:EE:FF', r: 255, g: 128, b: 64 });

      expect(result.ok).toBe(true);
      expect(mockGoveeClient.controlDevice).toHaveBeenCalledWith({
        device: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        cmd: { name: 'color', value: { r: 255, g: 128, b: 64 } },
      });
    });

    it('should return error when device does not support color', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockDeviceNoBrightness);

      const result = await service.setColor({ device: '11:22:33:44:55:66', r: 255, g: 0, b: 0 });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.COMMAND_NOT_SUPPORTED);
    });
  });

  describe('device validation', () => {
    it('should return error when device is not controllable', async () => {
      mockDeviceService.getDeviceOrThrow.mockResolvedValue(mockNonControllableDevice);

      const result = await service.turn({ device: '77:88:99:AA:BB:CC', power: 'on' });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.DEVICE_NOT_CONTROLLABLE);
    });
  });
});
