/**
 * Govee API type definitions
 */

// Govee API device response (raw from API)
export interface GoveeDevice {
  device: string; // Device ID (MAC address format)
  model: string; // Model number
  deviceName: string; // User-assigned name
  controllable: boolean;
  retrievable: boolean;
  supportCmds: string[]; // ['turn', 'brightness', 'color', 'colorTem']
}

// Govee API device list response
export interface GoveeDeviceListResponse {
  code: number;
  message: string;
  data: {
    devices: GoveeDevice[];
  };
}

// Color value for Govee API
export interface GoveeColorValue {
  r: number;
  g: number;
  b: number;
}

// Command types for Govee API
export type GoveeCommandName = 'turn' | 'brightness' | 'color' | 'colorTem';
export type GoveeCommandValue = string | number | GoveeColorValue;

// Govee API control command
export interface GoveeCommand {
  name: GoveeCommandName;
  value: GoveeCommandValue;
}

// Govee API control request body
export interface GoveeControlRequest {
  device: string;
  model: string;
  cmd: GoveeCommand;
}

// Govee API generic response
export interface GoveeApiResponse {
  code: number;
  message: string;
  data?: unknown;
}

// Control parameters for internal use
export interface GoveeControlParams {
  device: string;
  model: string;
  cmd: GoveeCommand;
}
