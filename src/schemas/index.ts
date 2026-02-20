export {
  turnParamsSchema,
  brightnessParamsSchema,
  colorParamsSchema,
  mcpInvokeSchema,
  type TurnParams,
  type BrightnessParams,
  type ColorParams,
  type McpInvokeRequest,
} from './control.schema.js';

export {
  supportedCommandSchema,
  deviceSchema,
  deviceListResultSchema,
  type SupportedCommand,
  type Device,
  type DeviceListResult,
} from './device.schema.js';

export {
  mcpSuccessResponseSchema,
  mcpErrorSchema,
  mcpErrorResponseSchema,
  mcpResponseSchema,
  type McpSuccessResponse,
  type McpError,
  type McpErrorResponse,
  type McpResponse,
} from './response.schema.js';
