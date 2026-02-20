import type { Config } from '../config/index.js';
import type { GoveeDevice } from '../types/index.js';
import type { Device, DeviceListResult, SupportedCommand } from '../schemas/device.schema.js';
import { GoveeClient } from '../clients/govee.client.js';
import { LRUCache } from '../utils/cache.js';
import { NotFoundError } from '../utils/errors.js';

const DEVICES_CACHE_KEY = 'devices';

export class DeviceService {
  private readonly goveeClient: GoveeClient;
  private readonly cache: LRUCache<Device[]>;
  private readonly defaultDeviceId?: string;

  constructor(goveeClient: GoveeClient, config: Config) {
    this.goveeClient = goveeClient;
    this.cache = new LRUCache<Device[]>({
      defaultTtlMs: config.deviceCacheTtlMs,
      maxSize: 1,
    });
    this.defaultDeviceId = config.defaultDeviceId;
  }

  /**
   * Get all devices using cache-first strategy
   */
  async getDevices(): Promise<DeviceListResult> {
    // Try cache first
    const cacheEntry = this.cache.get(DEVICES_CACHE_KEY);

    if (cacheEntry !== null) {
      return {
        devices: cacheEntry.value,
        cached: true,
        cacheAge: LRUCache.getCacheAgeSeconds(cacheEntry),
      };
    }

    // Cache miss - fetch from Govee API
    const goveeDevices = await this.goveeClient.getDevices();
    const devices = goveeDevices.map((gd) => this.transformDevice(gd));

    // Store in cache
    this.cache.set(DEVICES_CACHE_KEY, devices);

    return {
      devices,
      cached: false,
      cacheAge: 0,
    };
  }

  /**
   * Get a single device by ID
   */
  async getDevice(deviceId: string): Promise<Device | null> {
    const result = await this.getDevices();
    return result.devices.find((d) => d.deviceId === deviceId) ?? null;
  }

  /**
   * Get a single device by ID, throwing if not found
   */
  async getDeviceOrThrow(deviceId: string): Promise<Device> {
    const device = await this.getDevice(deviceId);
    if (device === null) {
      throw new NotFoundError(`Device not found: ${deviceId}`, { deviceId });
    }
    return device;
  }

  /**
   * Get the default device
   * Priority: configured default > first controllable device
   */
  async getDefaultDevice(): Promise<Device | null> {
    const result = await this.getDevices();

    // If default device ID is configured, try to find it
    if (this.defaultDeviceId !== undefined) {
      const defaultDevice = result.devices.find(
        (d) => d.deviceId === this.defaultDeviceId
      );
      if (defaultDevice !== undefined) {
        return defaultDevice;
      }
    }

    // Fall back to first controllable device
    return result.devices.find((d) => d.controllable) ?? null;
  }

  /**
   * Invalidate the device cache
   */
  invalidateCache(): void {
    this.cache.delete(DEVICES_CACHE_KEY);
  }

  /**
   * Transform Govee API device to normalized Device model
   */
  private transformDevice(goveeDevice: GoveeDevice): Device {
    return {
      deviceId: goveeDevice.device,
      model: goveeDevice.model,
      deviceName: goveeDevice.deviceName,
      controllable: goveeDevice.controllable,
      retrievable: goveeDevice.retrievable,
      supportedCommands: goveeDevice.supportCmds.filter(
        (cmd): cmd is SupportedCommand =>
          cmd === 'turn' || cmd === 'brightness' || cmd === 'color' || cmd === 'colorTem'
      ),
    };
  }
}
