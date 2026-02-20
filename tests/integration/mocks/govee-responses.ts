/**
 * Govee API mock response fixtures for integration tests.
 * These fixtures match the actual Govee API response format.
 */

import type {
  GoveeDevice,
  GoveeDeviceListResponse,
  GoveeApiResponse,
} from '../../../src/types/index.js';

/**
 * Mock Govee devices for testing
 */
export const mockDevices: GoveeDevice[] = [
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
    model: 'H6159',
    deviceName: 'Kitchen Strip',
    controllable: true,
    retrievable: true,
    supportCmds: ['turn', 'brightness', 'color', 'colorTem'],
  },
];

/**
 * Successful device list response
 */
export const successfulDeviceListResponse: GoveeDeviceListResponse = {
  code: 200,
  message: 'Success',
  data: {
    devices: mockDevices,
  },
};

/**
 * Empty device list response (valid but no devices)
 */
export const emptyDeviceListResponse: GoveeDeviceListResponse = {
  code: 200,
  message: 'Success',
  data: {
    devices: [],
  },
};

/**
 * Successful control response
 */
export const successfulControlResponse: GoveeApiResponse = {
  code: 200,
  message: 'Success',
  data: {},
};

/**
 * Error responses for various HTTP status codes
 */
export const errorResponses = {
  /**
   * 400 Bad Request - Invalid parameters
   */
  badRequest: {
    statusCode: 400,
    body: {
      code: 400,
      message: 'Invalid parameter: device',
    },
  },

  /**
   * 401 Unauthorized - Invalid API key
   */
  unauthorized: {
    statusCode: 401,
    body: {
      code: 401,
      message: 'Invalid API key',
    },
  },

  /**
   * 429 Too Many Requests - Rate limited
   */
  rateLimited: {
    statusCode: 429,
    body: {
      code: 429,
      message: 'Rate limit exceeded',
    },
  },

  /**
   * 500 Internal Server Error
   */
  internalServerError: {
    statusCode: 500,
    body: {
      code: 500,
      message: 'Internal server error',
    },
  },

  /**
   * 502 Bad Gateway
   */
  badGateway: {
    statusCode: 502,
    body: {
      code: 502,
      message: 'Bad gateway',
    },
  },

  /**
   * 503 Service Unavailable
   */
  serviceUnavailable: {
    statusCode: 503,
    body: {
      code: 503,
      message: 'Service temporarily unavailable',
    },
  },
};

/**
 * Helper to get a single mock device by ID
 */
export function getMockDeviceById(deviceId: string): GoveeDevice | undefined {
  return mockDevices.find((d) => d.device === deviceId);
}

/**
 * Helper to create a device list response with specific devices
 */
export function createDeviceListResponse(devices: GoveeDevice[]): GoveeDeviceListResponse {
  return {
    code: 200,
    message: 'Success',
    data: {
      devices,
    },
  };
}

/**
 * Helper to create an error response
 */
export function createErrorResponse(code: number, message: string): GoveeApiResponse {
  return {
    code,
    message,
  };
}
