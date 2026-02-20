import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolService } from '../../../src/services/tool.service.js';
import { DeviceService } from '../../../src/services/device.service.js';
import { ControlService } from '../../../src/services/control.service.js';
import type { DeviceListResult } from '../../../src/schemas/device.schema.js';

describe('ToolService', () => {
  let mockDeviceService: {
    getDevices: ReturnType<typeof vi.fn>;
  };
  let mockControlService: {
    turn: ReturnType<typeof vi.fn>;
    setBrightness: ReturnType<typeof vi.fn>;
    setColor: ReturnType<typeof vi.fn>;
  };
  let service: ToolService;

  const mockDeviceListResult: DeviceListResult = {
    devices: [
      {
        deviceId: 'AA:BB:CC:DD:EE:FF',
        model: 'H6160',
        deviceName: 'Living Room Light',
        controllable: true,
        retrievable: true,
        supportedCommands: ['turn', 'brightness', 'color'],
      },
    ],
    cached: false,
    cacheAge: 0,
  };

  beforeEach(() => {
    mockDeviceService = {
      getDevices: vi.fn(),
    };

    mockControlService = {
      turn: vi.fn(),
      setBrightness: vi.fn(),
      setColor: vi.fn(),
    };

    service = new ToolService(
      mockDeviceService as unknown as DeviceService,
      mockControlService as unknown as ControlService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('invoke', () => {
    describe('turn tool', () => {
      it('should invoke turn with valid params', async () => {
        mockControlService.turn.mockResolvedValue({
          ok: true,
          goveeResponse: { code: 200, message: 'success' },
        });

        const result = await service.invoke('turn', { power: 'on' });

        expect(result.ok).toBe(true);
        expect(result.result).toEqual({ code: 200, message: 'success' });
        expect(mockControlService.turn).toHaveBeenCalledWith({ power: 'on' });
      });

      it('should return error for invalid power value', async () => {
        const result = await service.invoke('turn', { power: 'invalid' });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
        expect(mockControlService.turn).not.toHaveBeenCalled();
      });

      it('should return error for missing power param', async () => {
        const result = await service.invoke('turn', {});

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });

      it('should pass through control service errors', async () => {
        mockControlService.turn.mockResolvedValue({
          ok: false,
          error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' },
        });

        const result = await service.invoke('turn', { power: 'on' });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('DEVICE_NOT_FOUND');
      });
    });

    describe('brightness tool', () => {
      it('should invoke brightness with valid params', async () => {
        mockControlService.setBrightness.mockResolvedValue({
          ok: true,
          goveeResponse: { code: 200, message: 'success' },
        });

        const result = await service.invoke('brightness', { level: 50 });

        expect(result.ok).toBe(true);
        expect(mockControlService.setBrightness).toHaveBeenCalledWith({ level: 50 });
      });

      it('should return error for level below minimum', async () => {
        const result = await service.invoke('brightness', { level: 0 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });

      it('should return error for level above maximum', async () => {
        const result = await service.invoke('brightness', { level: 101 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });

      it('should return error for non-integer level', async () => {
        const result = await service.invoke('brightness', { level: 50.5 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });
    });

    describe('color tool', () => {
      it('should invoke color with valid RGB params', async () => {
        mockControlService.setColor.mockResolvedValue({
          ok: true,
          goveeResponse: { code: 200, message: 'success' },
        });

        const result = await service.invoke('color', { r: 255, g: 128, b: 64 });

        expect(result.ok).toBe(true);
        expect(mockControlService.setColor).toHaveBeenCalledWith({ r: 255, g: 128, b: 64 });
      });

      it('should return error for missing color components', async () => {
        const result = await service.invoke('color', { r: 255, g: 128 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });

      it('should return error for color value below 0', async () => {
        const result = await service.invoke('color', { r: -1, g: 128, b: 64 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });

      it('should return error for color value above 255', async () => {
        const result = await service.invoke('color', { r: 256, g: 128, b: 64 });

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
      });
    });

    describe('list_devices tool', () => {
      it('should return device list', async () => {
        mockDeviceService.getDevices.mockResolvedValue(mockDeviceListResult);

        const result = await service.invoke('list_devices', {});

        expect(result.ok).toBe(true);
        expect(result.result).toEqual(mockDeviceListResult);
      });

      it('should handle device service errors', async () => {
        mockDeviceService.getDevices.mockRejectedValue(new Error('API error'));

        const result = await service.invoke('list_devices', {});

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INTERNAL_ERROR');
      });
    });

    describe('unknown tool', () => {
      it('should return error for unknown tool name', async () => {
        const result = await service.invoke('unknown_tool', {});

        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe('INVALID_REQUEST');
        expect(result.error?.message).toContain('Unknown tool');
      });
    });
  });

  describe('getManifest', () => {
    it('should return tool manifest with all tools', () => {
      const manifest = service.getManifest();

      expect(manifest.tools).toHaveLength(4);

      const toolIds = manifest.tools.map(t => t.id);
      expect(toolIds).toContain('turn');
      expect(toolIds).toContain('brightness');
      expect(toolIds).toContain('color');
      expect(toolIds).toContain('list_devices');
    });

    it('should include correct schema for turn tool', () => {
      const manifest = service.getManifest();
      const turnTool = manifest.tools.find(t => t.id === 'turn');

      expect(turnTool).toBeDefined();
      expect(turnTool!.description).toContain('Turn');
      expect(turnTool!.input_schema.type).toBe('object');
      expect(turnTool!.input_schema.required).toContain('power');
      expect(turnTool!.input_schema.properties).toHaveProperty('power');
      expect(turnTool!.input_schema.properties).toHaveProperty('device');
    });

    it('should include correct schema for brightness tool', () => {
      const manifest = service.getManifest();
      const brightnessTool = manifest.tools.find(t => t.id === 'brightness');

      expect(brightnessTool).toBeDefined();
      expect(brightnessTool!.input_schema.required).toContain('level');
      expect(brightnessTool!.input_schema.properties).toHaveProperty('level');
    });

    it('should include correct schema for color tool', () => {
      const manifest = service.getManifest();
      const colorTool = manifest.tools.find(t => t.id === 'color');

      expect(colorTool).toBeDefined();
      expect(colorTool!.input_schema.required).toContain('r');
      expect(colorTool!.input_schema.required).toContain('g');
      expect(colorTool!.input_schema.required).toContain('b');
    });

    it('should include schema for list_devices tool', () => {
      const manifest = service.getManifest();
      const listDevicesTool = manifest.tools.find(t => t.id === 'list_devices');

      expect(listDevicesTool).toBeDefined();
      expect(listDevicesTool!.input_schema.type).toBe('object');
    });
  });
});
