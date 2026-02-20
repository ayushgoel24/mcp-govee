export enum ErrorCode {
  // Authentication
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Validation
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  INVALID_PARAMETER = 'INVALID_PARAMETER',

  // Device
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_NOT_CONTROLLABLE = 'DEVICE_NOT_CONTROLLABLE',
  COMMAND_NOT_SUPPORTED = 'COMMAND_NOT_SUPPORTED',

  // External
  GOVEE_API_ERROR = 'GOVEE_API_ERROR',
  GOVEE_RATE_LIMITED = 'GOVEE_RATE_LIMITED',
  GOVEE_UNAVAILABLE = 'GOVEE_UNAVAILABLE',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorDetails {
  field?: string;
  received?: unknown;
  expected?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { code: ErrorCode; message: string; details?: ErrorDetails } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ErrorCode.INVALID_REQUEST, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ErrorCode.DEVICE_NOT_FOUND, message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class GoveeApiError extends AppError {
  public readonly goveeCode?: number;

  constructor(code: ErrorCode, message: string, statusCode: number, goveeCode?: number, details?: ErrorDetails) {
    super(code, message, statusCode, details);
    this.name = 'GoveeApiError';
    this.goveeCode = goveeCode;
  }

  static rateLimited(): GoveeApiError {
    return new GoveeApiError(
      ErrorCode.GOVEE_RATE_LIMITED,
      'Govee API rate limit exceeded. Please try again later.',
      503,
      429
    );
  }

  static unavailable(message = 'Govee API is unavailable'): GoveeApiError {
    return new GoveeApiError(ErrorCode.GOVEE_UNAVAILABLE, message, 502);
  }

  static apiError(message: string, goveeCode?: number): GoveeApiError {
    return new GoveeApiError(ErrorCode.GOVEE_API_ERROR, message, 502, goveeCode);
  }
}

export function mapZodError(zodError: { issues: Array<{ path: (string | number)[]; message: string }> }): ValidationError {
  const firstIssue = zodError.issues[0];
  if (firstIssue === undefined) {
    return new ValidationError('Validation failed');
  }
  const field = firstIssue.path.join('.');
  return new ValidationError(firstIssue.message, { field });
}
