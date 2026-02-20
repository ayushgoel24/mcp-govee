import { describe, it, expect } from 'vitest';
import { turnParamsSchema, brightnessParamsSchema, colorParamsSchema, mcpInvokeSchema } from '../../../src/schemas/index.js';

describe('Control Schemas', () => {
  describe('turnParamsSchema', () => {
    describe('valid inputs', () => {
      it('should accept valid turn on request', () => {
        const result = turnParamsSchema.parse({ power: 'on' });
        expect(result.power).toBe('on');
      });

      it('should accept valid turn off request', () => {
        const result = turnParamsSchema.parse({ power: 'off' });
        expect(result.power).toBe('off');
      });

      it('should accept request with device ID', () => {
        const result = turnParamsSchema.parse({ device: 'AA:BB:CC:DD:EE:FF', power: 'on' });
        expect(result.device).toBe('AA:BB:CC:DD:EE:FF');
      });

      it('should accept request with model', () => {
        const result = turnParamsSchema.parse({ model: 'H6001', power: 'on' });
        expect(result.model).toBe('H6001');
      });

      it('should accept lowercase hex in device ID', () => {
        const result = turnParamsSchema.parse({ device: 'aa:bb:cc:dd:ee:ff', power: 'on' });
        expect(result.device).toBe('aa:bb:cc:dd:ee:ff');
      });
    });

    describe('invalid inputs', () => {
      it('should reject missing power', () => {
        expect(() => turnParamsSchema.parse({})).toThrow();
      });

      it('should reject invalid power value', () => {
        expect(() => turnParamsSchema.parse({ power: 'toggle' })).toThrow();
      });

      it('should reject invalid device ID format', () => {
        expect(() => turnParamsSchema.parse({ device: 'invalid-device', power: 'on' })).toThrow();
      });

      it('should reject extraneous fields (strict mode)', () => {
        expect(() => turnParamsSchema.parse({ power: 'on', extra: 'field' })).toThrow();
      });
    });
  });

  describe('brightnessParamsSchema', () => {
    describe('valid inputs', () => {
      it('should accept valid brightness level 1', () => {
        const result = brightnessParamsSchema.parse({ level: 1 });
        expect(result.level).toBe(1);
      });

      it('should accept valid brightness level 100', () => {
        const result = brightnessParamsSchema.parse({ level: 100 });
        expect(result.level).toBe(100);
      });

      it('should accept valid brightness level 50', () => {
        const result = brightnessParamsSchema.parse({ level: 50 });
        expect(result.level).toBe(50);
      });

      it('should accept request with device ID', () => {
        const result = brightnessParamsSchema.parse({ device: 'AA:BB:CC', level: 50 });
        expect(result.device).toBe('AA:BB:CC');
      });
    });

    describe('invalid inputs', () => {
      it('should reject brightness level 0', () => {
        expect(() => brightnessParamsSchema.parse({ level: 0 })).toThrow();
      });

      it('should reject brightness level 101', () => {
        expect(() => brightnessParamsSchema.parse({ level: 101 })).toThrow();
      });

      it('should reject non-integer brightness level', () => {
        expect(() => brightnessParamsSchema.parse({ level: 50.5 })).toThrow();
      });

      it('should reject missing level', () => {
        expect(() => brightnessParamsSchema.parse({})).toThrow();
      });

      it('should reject negative level', () => {
        expect(() => brightnessParamsSchema.parse({ level: -10 })).toThrow();
      });
    });
  });

  describe('colorParamsSchema', () => {
    describe('valid inputs', () => {
      it('should accept valid RGB values', () => {
        const result = colorParamsSchema.parse({ r: 255, g: 128, b: 0 });
        expect(result).toEqual({ r: 255, g: 128, b: 0 });
      });

      it('should accept minimum RGB values', () => {
        const result = colorParamsSchema.parse({ r: 0, g: 0, b: 0 });
        expect(result).toEqual({ r: 0, g: 0, b: 0 });
      });

      it('should accept maximum RGB values', () => {
        const result = colorParamsSchema.parse({ r: 255, g: 255, b: 255 });
        expect(result).toEqual({ r: 255, g: 255, b: 255 });
      });

      it('should accept request with device ID', () => {
        const result = colorParamsSchema.parse({ device: 'AA:BB:CC', r: 255, g: 0, b: 0 });
        expect(result.device).toBe('AA:BB:CC');
      });
    });

    describe('invalid inputs', () => {
      it('should reject r value above 255', () => {
        expect(() => colorParamsSchema.parse({ r: 256, g: 0, b: 0 })).toThrow();
      });

      it('should reject negative r value', () => {
        expect(() => colorParamsSchema.parse({ r: -1, g: 0, b: 0 })).toThrow();
      });

      it('should reject non-integer r value', () => {
        expect(() => colorParamsSchema.parse({ r: 128.5, g: 0, b: 0 })).toThrow();
      });

      it('should reject missing r value', () => {
        expect(() => colorParamsSchema.parse({ g: 0, b: 0 })).toThrow();
      });

      it('should reject missing g value', () => {
        expect(() => colorParamsSchema.parse({ r: 0, b: 0 })).toThrow();
      });

      it('should reject missing b value', () => {
        expect(() => colorParamsSchema.parse({ r: 0, g: 0 })).toThrow();
      });
    });
  });

  describe('mcpInvokeSchema', () => {
    describe('valid inputs', () => {
      it('should accept turn tool', () => {
        const result = mcpInvokeSchema.parse({ tool: 'turn', params: { power: 'on' } });
        expect(result.tool).toBe('turn');
      });

      it('should accept brightness tool', () => {
        const result = mcpInvokeSchema.parse({ tool: 'brightness', params: { level: 50 } });
        expect(result.tool).toBe('brightness');
      });

      it('should accept color tool', () => {
        const result = mcpInvokeSchema.parse({ tool: 'color', params: { r: 255, g: 0, b: 0 } });
        expect(result.tool).toBe('color');
      });

      it('should accept list_devices tool', () => {
        const result = mcpInvokeSchema.parse({ tool: 'list_devices' });
        expect(result.tool).toBe('list_devices');
      });

      it('should default params to empty object', () => {
        const result = mcpInvokeSchema.parse({ tool: 'list_devices' });
        expect(result.params).toEqual({});
      });
    });

    describe('invalid inputs', () => {
      it('should reject invalid tool name', () => {
        expect(() => mcpInvokeSchema.parse({ tool: 'invalid' })).toThrow();
      });

      it('should reject missing tool', () => {
        expect(() => mcpInvokeSchema.parse({ params: {} })).toThrow();
      });

      it('should reject extraneous fields (strict mode)', () => {
        expect(() => mcpInvokeSchema.parse({ tool: 'turn', params: {}, extra: 'field' })).toThrow();
      });
    });
  });
});
