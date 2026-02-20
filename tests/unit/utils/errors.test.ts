import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  GoveeApiError,
  mapZodError,
} from '../../../src/utils/errors.js';

describe('Error Handling', () => {
  describe('ErrorCode', () => {
    it('should have authentication error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
    });

    it('should have validation error codes', () => {
      expect(ErrorCode.INVALID_REQUEST).toBe('INVALID_REQUEST');
      expect(ErrorCode.MISSING_PARAMETER).toBe('MISSING_PARAMETER');
      expect(ErrorCode.INVALID_PARAMETER).toBe('INVALID_PARAMETER');
    });

    it('should have device error codes', () => {
      expect(ErrorCode.DEVICE_NOT_FOUND).toBe('DEVICE_NOT_FOUND');
      expect(ErrorCode.DEVICE_NOT_CONTROLLABLE).toBe('DEVICE_NOT_CONTROLLABLE');
      expect(ErrorCode.COMMAND_NOT_SUPPORTED).toBe('COMMAND_NOT_SUPPORTED');
    });

    it('should have external error codes', () => {
      expect(ErrorCode.GOVEE_API_ERROR).toBe('GOVEE_API_ERROR');
      expect(ErrorCode.GOVEE_RATE_LIMITED).toBe('GOVEE_RATE_LIMITED');
      expect(ErrorCode.GOVEE_UNAVAILABLE).toBe('GOVEE_UNAVAILABLE');
    });

    it('should have internal error codes', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });

  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError(ErrorCode.INVALID_REQUEST, 'Test message', 400, { field: 'test' });
      expect(error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'test' });
      expect(error.name).toBe('AppError');
    });

    it('should create error without details', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Internal error', 500);
      expect(error.details).toBeUndefined();
    });

    it('should convert to JSON', () => {
      const error = new AppError(ErrorCode.INVALID_REQUEST, 'Test message', 400, { field: 'test' });
      const json = error.toJSON();
      expect(json).toEqual({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Test message',
        details: { field: 'test' },
      });
    });

    it('should convert to JSON without details when not set', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Error', 500);
      const json = error.toJSON();
      expect(json).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Error',
      });
      expect('details' in json).toBe(false);
    });

    it('should have a stack trace', () => {
      const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Test', 500);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct defaults', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should accept details', () => {
      const error = new ValidationError('Invalid input', { field: 'email', received: 'invalid' });
      expect(error.details).toEqual({ field: 'email', received: 'invalid' });
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('Device not found');
      expect(error.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Device not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should accept details', () => {
      const error = new NotFoundError('Device not found', { deviceId: 'AA:BB:CC' });
      expect(error.details).toEqual({ deviceId: 'AA:BB:CC' });
    });
  });

  describe('GoveeApiError', () => {
    it('should create Govee API error', () => {
      const error = new GoveeApiError(ErrorCode.GOVEE_API_ERROR, 'API error', 502, 500);
      expect(error.code).toBe(ErrorCode.GOVEE_API_ERROR);
      expect(error.statusCode).toBe(502);
      expect(error.goveeCode).toBe(500);
      expect(error.name).toBe('GoveeApiError');
    });

    it('should create rate limited error', () => {
      const error = GoveeApiError.rateLimited();
      expect(error.code).toBe(ErrorCode.GOVEE_RATE_LIMITED);
      expect(error.statusCode).toBe(503);
      expect(error.goveeCode).toBe(429);
      expect(error.message).toContain('rate limit');
    });

    it('should create unavailable error', () => {
      const error = GoveeApiError.unavailable();
      expect(error.code).toBe(ErrorCode.GOVEE_UNAVAILABLE);
      expect(error.statusCode).toBe(502);
    });

    it('should create unavailable error with custom message', () => {
      const error = GoveeApiError.unavailable('Custom unavailable message');
      expect(error.message).toBe('Custom unavailable message');
    });

    it('should create generic API error', () => {
      const error = GoveeApiError.apiError('Something went wrong', 400);
      expect(error.code).toBe(ErrorCode.GOVEE_API_ERROR);
      expect(error.statusCode).toBe(502);
      expect(error.goveeCode).toBe(400);
    });
  });

  describe('mapZodError', () => {
    it('should map Zod error to ValidationError', () => {
      const zodError = {
        issues: [
          { path: ['level'], message: 'Must be between 1 and 100' },
        ],
      };
      const error = mapZodError(zodError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Must be between 1 and 100');
      expect(error.details?.field).toBe('level');
    });

    it('should handle nested path', () => {
      const zodError = {
        issues: [
          { path: ['params', 'color', 'r'], message: 'Invalid value' },
        ],
      };
      const error = mapZodError(zodError);
      expect(error.details?.field).toBe('params.color.r');
    });

    it('should handle empty issues array', () => {
      const zodError = { issues: [] };
      const error = mapZodError(zodError);
      expect(error.message).toBe('Validation failed');
    });
  });
});
