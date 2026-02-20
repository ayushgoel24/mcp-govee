import { describe, it, expect } from 'vitest';
import { mcpSuccessResponseSchema, mcpErrorResponseSchema, mcpResponseSchema, mcpErrorSchema } from '../../../src/schemas/index.js';

describe('Response Schemas', () => {
  describe('mcpErrorSchema', () => {
    describe('valid inputs', () => {
      it('should accept error with code and message', () => {
        const result = mcpErrorSchema.parse({
          code: 'INVALID_REQUEST',
          message: 'Invalid request body',
        });
        expect(result.code).toBe('INVALID_REQUEST');
        expect(result.message).toBe('Invalid request body');
      });

      it('should accept error with details', () => {
        const result = mcpErrorSchema.parse({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { field: 'level', reason: 'must be integer' },
        });
        expect(result.details).toEqual({ field: 'level', reason: 'must be integer' });
      });
    });

    describe('invalid inputs', () => {
      it('should reject missing code', () => {
        expect(() => mcpErrorSchema.parse({ message: 'Error message' })).toThrow();
      });

      it('should reject missing message', () => {
        expect(() => mcpErrorSchema.parse({ code: 'ERROR' })).toThrow();
      });
    });
  });

  describe('mcpSuccessResponseSchema', () => {
    describe('valid inputs', () => {
      it('should accept success response with result', () => {
        const result = mcpSuccessResponseSchema.parse({
          ok: true,
          result: { status: 'completed' },
        });
        expect(result.ok).toBe(true);
        expect(result.result).toEqual({ status: 'completed' });
      });

      it('should accept success response with array result', () => {
        const result = mcpSuccessResponseSchema.parse({
          ok: true,
          result: [1, 2, 3],
        });
        expect(result.result).toEqual([1, 2, 3]);
      });

      it('should accept success response with null result', () => {
        const result = mcpSuccessResponseSchema.parse({
          ok: true,
          result: null,
        });
        expect(result.result).toBeNull();
      });
    });

    describe('invalid inputs', () => {
      it('should reject ok: false', () => {
        expect(() => mcpSuccessResponseSchema.parse({
          ok: false,
          result: {},
        })).toThrow();
      });

      it('should reject missing ok', () => {
        expect(() => mcpSuccessResponseSchema.parse({
          result: {},
        })).toThrow();
      });
    });
  });

  describe('mcpErrorResponseSchema', () => {
    describe('valid inputs', () => {
      it('should accept error response', () => {
        const result = mcpErrorResponseSchema.parse({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('UNAUTHORIZED');
      });

      it('should accept error response with details', () => {
        const result = mcpErrorResponseSchema.parse({
          ok: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Invalid brightness level',
            details: { field: 'level', received: 150, expected: '1-100' },
          },
        });
        expect(result.error.details).toBeDefined();
      });
    });

    describe('invalid inputs', () => {
      it('should reject ok: true', () => {
        expect(() => mcpErrorResponseSchema.parse({
          ok: true,
          error: { code: 'ERROR', message: 'Error' },
        })).toThrow();
      });

      it('should reject missing error', () => {
        expect(() => mcpErrorResponseSchema.parse({
          ok: false,
        })).toThrow();
      });
    });
  });

  describe('mcpResponseSchema (discriminated union)', () => {
    it('should parse success response', () => {
      const result = mcpResponseSchema.parse({
        ok: true,
        result: { data: 'test' },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result).toEqual({ data: 'test' });
      }
    });

    it('should parse error response', () => {
      const result = mcpResponseSchema.parse({
        ok: false,
        error: { code: 'ERROR', message: 'Test error' },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERROR');
      }
    });

    it('should reject response without ok field', () => {
      expect(() => mcpResponseSchema.parse({
        result: {},
      })).toThrow();
    });
  });
});
