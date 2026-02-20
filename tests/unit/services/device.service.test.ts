import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceService } from '../../../src/services/device.service.js';
import { GoveeClient } from '../../../src/clients/govee.client.js';
import type { GoveeDevice } from '../../../src/types/index.js';
import type { Config } from '../../../src/config/index.js';
import { NotFoundError, GoveeApiError, ErrorCode } from '../../../src/utils/errors.js';

// Mock GoveeClient
vi.mock('../../../src/clients/govee.client.js', () => ({
  GoveeClient: vi.fn(),
}));

describe('DeviceService', () => {
  let mockGoveeClient: { getDevices: ReturnType<typeof vi.fn> };
  let service: DeviceService;
  let config: Config;

  const mockGoveeDevices: GoveeDevice[] = [
    {
      device: 'AA:BB:CC:DD:EE:FF',
      model: 'H6160',
      deviceName: 'Living Room Light',
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness', 'color'],
    },
    {
      device: '11:22:33:44:55:66',
      model: 'H6141',
      deviceName: 'Bedroom Light',
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness'],
    },
    {
      device: '77:88:99:AA:BB:CC',
      model: 'H6003',
      deviceName: 'Non-controllable Device',
      controllable: false,
      retrievable: true,
      supportCmds: [],
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();

    mockGoveeClient = {
      getDevices: vi.fn(),
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

    service = new DeviceService(mockGoveeClient as unknown as GoveeClient, config);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('getDevices', () => {
    it('should fetch devices from API on cache miss', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const result = await service.getDevices();

      expect(result.cached).toBe(false);
      expect(result.cacheAge).toBe(0);
      expect(result.devices).toHaveLength(3);
      expect(mockGoveeClient.getDevices).toHaveBeenCalledTimes(1);
    });

    it('should return cached devices on cache hit', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      // First call - cache miss
      await service.getDevices();

      // Second call - should be from cache
      const result = await service.getDevices();

      expect(result.cached).toBe(true);
      expect(mockGoveeClient.getDevices).toHaveBeenCalledTimes(1);
    });

    it('should return cache age in seconds', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      await service.getDevices();

      // Advance time by 10 seconds
      vi.advanceTimersByTime(10000);

      const result = await service.getDevices();

      expect(result.cached).toBe(true);
      expect(result.cacheAge).toBe(10);
    });

    it('should fetch fresh data after cache expires', async () => {
      mockGoveeClient.getDevices.mockResolvedValue(mockGoveeDevices);

      await service.getDevices();

      // Advance time past cache TTL
      vi.advanceTimersByTime(300001);

      const result = await service.getDevices();

      expect(result.cached).toBe(false);
      expect(mockGoveeClient.getDevices).toHaveBeenCalledTimes(2);
    });

    it('should transform GoveeDevice to Device correctly', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const result = await service.getDevices();

      const device = result.devices[0];
      expect(device.deviceId).toBe('AA:BB:CC:DD:EE:FF');
      expect(device.model).toBe('H6160');
      expect(device.deviceName).toBe('Living Room Light');
      expect(device.controllable).toBe(true);
      expect(device.retrievable).toBe(true);
      expect(device.supportedCommands).toEqual(['turn', 'brightness', 'color']);
    });

    it('should filter unsupported commands', async () => {
      const devicesWithUnknownCmd: GoveeDevice[] = [
        {
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6160',
          deviceName: 'Test Device',
          controllable: true,
          retrievable: true,
          supportCmds: ['turn', 'brightness', 'unknownCmd', 'color'],
        },
      ];
      mockGoveeClient.getDevices.mockResolvedValueOnce(devicesWithUnknownCmd);

      const result = await service.getDevices();

      expect(result.devices[0].supportedCommands).toEqual(['turn', 'brightness', 'color']);
    });

    it('should propagate API errors', async () => {
      mockGoveeClient.getDevices.mockRejectedValueOnce(
        GoveeApiError.unavailable('API error')
      );

      await expect(service.getDevices()).rejects.toThrow(GoveeApiError);
    });
  });

  describe('getDevice', () => {
    it('should return device by ID', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await service.getDevice('AA:BB:CC:DD:EE:FF');

      expect(device).not.toBeNull();
      expect(device!.deviceId).toBe('AA:BB:CC:DD:EE:FF');
      expect(device!.deviceName).toBe('Living Room Light');
    });

    it('should return null for non-existent device', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await service.getDevice('XX:XX:XX:XX:XX:XX');

      expect(device).toBeNull();
    });

    it('should use cached devices', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      await service.getDevice('AA:BB:CC:DD:EE:FF');
      await service.getDevice('11:22:33:44:55:66');

      expect(mockGoveeClient.getDevices).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDeviceOrThrow', () => {
    it('should return device when found', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await service.getDeviceOrThrow('AA:BB:CC:DD:EE:FF');

      expect(device.deviceId).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should throw NotFoundError when device not found', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      await expect(service.getDeviceOrThrow('XX:XX:XX:XX:XX:XX')).rejects.toThrow(NotFoundError);
      await expect(service.getDeviceOrThrow('XX:XX:XX:XX:XX:XX')).rejects.toMatchObject({
        code: ErrorCode.DEVICE_NOT_FOUND,
      });
    });
  });

  describe('getDefaultDevice', () => {
    it('should return configured default device', async () => {
      const configWithDefault: Config = {
        ...config,
        defaultDeviceId: '11:22:33:44:55:66',
      };
      const serviceWithDefault = new DeviceService(
        mockGoveeClient as unknown as GoveeClient,
        configWithDefault
      );

      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await serviceWithDefault.getDefaultDevice();

      expect(device).not.toBeNull();
      expect(device!.deviceId).toBe('11:22:33:44:55:66');
    });

    it('should return first controllable device when no default configured', async () => {
      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await service.getDefaultDevice();

      expect(device).not.toBeNull();
      expect(device!.deviceId).toBe('AA:BB:CC:DD:EE:FF');
      expect(device!.controllable).toBe(true);
    });

    it('should fall back to first controllable when configured default not found', async () => {
      const configWithBadDefault: Config = {
        ...config,
        defaultDeviceId: 'NON:EX:IS:TE:NT:ID',
      };
      const serviceWithBadDefault = new DeviceService(
        mockGoveeClient as unknown as GoveeClient,
        configWithBadDefault
      );

      mockGoveeClient.getDevices.mockResolvedValueOnce(mockGoveeDevices);

      const device = await serviceWithBadDefault.getDefaultDevice();

      expect(device).not.toBeNull();
      expect(device!.deviceId).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should return null when no controllable devices exist', async () => {
      const nonControllableDevices: GoveeDevice[] = [
        {
          device: 'AA:BB:CC:DD:EE:FF',
          model: 'H6003',
          deviceName: 'Non-controllable Device',
          controllable: false,
          retrievable: true,
          supportCmds: [],
        },
      ];
      mockGoveeClient.getDevices.mockResolvedValueOnce(nonControllableDevices);

      const device = await service.getDefaultDevice();

      expect(device).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should clear cache and fetch fresh data on next call', async () => {
      mockGoveeClient.getDevices.mockResolvedValue(mockGoveeDevices);

      // First call - populate cache
      await service.getDevices();

      // Invalidate cache
      service.invalidateCache();

      // Next call should fetch from API
      const result = await service.getDevices();

      expect(result.cached).toBe(false);
      expect(mockGoveeClient.getDevices).toHaveBeenCalledTimes(2);
    });
  });
});
