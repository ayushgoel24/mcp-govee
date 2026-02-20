import { describe, it, expect } from 'vitest';
import { deviceSchema, deviceListResultSchema, supportedCommandSchema } from '../../../src/schemas/index.js';

describe('Device Schemas', () => {
  describe('supportedCommandSchema', () => {
    it('should accept turn command', () => {
      expect(supportedCommandSchema.parse('turn')).toBe('turn');
    });

    it('should accept brightness command', () => {
      expect(supportedCommandSchema.parse('brightness')).toBe('brightness');
    });

    it('should accept color command', () => {
      expect(supportedCommandSchema.parse('color')).toBe('color');
    });

    it('should accept colorTem command', () => {
      expect(supportedCommandSchema.parse('colorTem')).toBe('colorTem');
    });

    it('should reject invalid command', () => {
      expect(() => supportedCommandSchema.parse('invalid')).toThrow();
    });
  });

  describe('deviceSchema', () => {
    const validDevice = {
      deviceId: 'AA:BB:CC:DD:EE:FF',
      model: 'H6001',
      deviceName: 'Living Room Light',
      controllable: true,
      retrievable: true,
      supportedCommands: ['turn', 'brightness', 'color'],
    };

    describe('valid inputs', () => {
      it('should accept valid device object', () => {
        const result = deviceSchema.parse(validDevice);
        expect(result.deviceId).toBe('AA:BB:CC:DD:EE:FF');
        expect(result.model).toBe('H6001');
        expect(result.deviceName).toBe('Living Room Light');
        expect(result.controllable).toBe(true);
        expect(result.retrievable).toBe(true);
        expect(result.supportedCommands).toEqual(['turn', 'brightness', 'color']);
      });

      it('should accept device with no supported commands', () => {
        const result = deviceSchema.parse({ ...validDevice, supportedCommands: [] });
        expect(result.supportedCommands).toEqual([]);
      });

      it('should accept non-controllable device', () => {
        const result = deviceSchema.parse({ ...validDevice, controllable: false });
        expect(result.controllable).toBe(false);
      });
    });

    describe('invalid inputs', () => {
      it('should reject missing deviceId', () => {
        const { deviceId: _, ...rest } = validDevice;
        expect(() => deviceSchema.parse(rest)).toThrow();
      });

      it('should reject missing model', () => {
        const { model: _, ...rest } = validDevice;
        expect(() => deviceSchema.parse(rest)).toThrow();
      });

      it('should reject missing deviceName', () => {
        const { deviceName: _, ...rest } = validDevice;
        expect(() => deviceSchema.parse(rest)).toThrow();
      });

      it('should reject invalid supportedCommands', () => {
        expect(() => deviceSchema.parse({ ...validDevice, supportedCommands: ['invalid'] })).toThrow();
      });
    });
  });

  describe('deviceListResultSchema', () => {
    const validDevice = {
      deviceId: 'AA:BB:CC:DD:EE:FF',
      model: 'H6001',
      deviceName: 'Test Light',
      controllable: true,
      retrievable: true,
      supportedCommands: ['turn'],
    };

    describe('valid inputs', () => {
      it('should accept valid device list result', () => {
        const result = deviceListResultSchema.parse({
          devices: [validDevice],
          cached: false,
        });
        expect(result.devices).toHaveLength(1);
        expect(result.cached).toBe(false);
      });

      it('should accept empty device list', () => {
        const result = deviceListResultSchema.parse({
          devices: [],
          cached: true,
        });
        expect(result.devices).toHaveLength(0);
      });

      it('should accept cache age', () => {
        const result = deviceListResultSchema.parse({
          devices: [],
          cached: true,
          cacheAge: 120,
        });
        expect(result.cacheAge).toBe(120);
      });

      it('should allow cacheAge to be undefined', () => {
        const result = deviceListResultSchema.parse({
          devices: [],
          cached: false,
        });
        expect(result.cacheAge).toBeUndefined();
      });
    });

    describe('invalid inputs', () => {
      it('should reject missing devices array', () => {
        expect(() => deviceListResultSchema.parse({ cached: false })).toThrow();
      });

      it('should reject missing cached flag', () => {
        expect(() => deviceListResultSchema.parse({ devices: [] })).toThrow();
      });

      it('should reject invalid device in array', () => {
        expect(() => deviceListResultSchema.parse({
          devices: [{ invalid: true }],
          cached: false,
        })).toThrow();
      });
    });
  });
});
