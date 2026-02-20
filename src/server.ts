import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { getConfig, type Config } from './config/index.js';
import { healthRoutes } from './routes/health.js';
import { devicesRoutes } from './routes/devices.js';
import { mcpRoutes } from './routes/mcp.js';
import { manifestRoutes } from './routes/manifest.js';
import { requestIdPlugin } from './middleware/requestId.js';
import { authPlugin } from './middleware/auth.js';
import { rateLimitPlugin } from './middleware/rateLimit.js';
import { securityHeadersPlugin } from './middleware/securityHeaders.js';
import { errorHandlerPlugin } from './utils/errorHandler.js';
import { GoveeClient } from './clients/govee.client.js';
import { DeviceService } from './services/device.service.js';
import { ControlService } from './services/control.service.js';
import { ToolService } from './services/tool.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    goveeClient: GoveeClient;
    deviceService: DeviceService;
    toolService: ToolService;
  }
}

export interface ServerOptions {
  config?: Config;
}

export function createServer(options: ServerOptions = {}): FastifyInstance {
  const config = options.config ?? getConfig();
  const isDevelopment = config.nodeEnv === 'development';

  const server = Fastify({
    // Request limits
    bodyLimit: 1048576, // 1 MB max body size
    connectionTimeout: 30000, // 30 seconds connection timeout
    requestTimeout: 30000, // 30 seconds request timeout

    logger: {
      level: config.logLevel,
      serializers: {
        req(request: FastifyRequest): Record<string, unknown> {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            requestId: request.id,
            userAgent: request.headers['user-agent'],
          };
        },
        res(reply): Record<string, unknown> {
          return {
            statusCode: reply.statusCode,
          };
        },
        // Custom error serializer - only include stack traces in development
        err(error: Error): { type: string; message: string; stack: string; [key: string]: unknown } {
          const serialized: { type: string; message: string; stack: string; [key: string]: unknown } = {
            type: error.name,
            message: error.message,
            // Include stack trace only in development mode
            stack: isDevelopment && error.stack ? error.stack : '',
          };

          // Include additional properties from AppError
          if ('code' in error) {
            serialized.code = (error as { code: string }).code;
          }
          if ('statusCode' in error) {
            serialized.statusCode = (error as { statusCode: number }).statusCode;
          }

          return serialized;
        },
      },
      redact: {
        paths: ['req.headers["x-mcp-auth"]', 'req.headers["authorization"]'],
        censor: '[REDACTED]',
      },
    },
    genReqId: (): string => randomUUID(),
    disableRequestLogging: false,
  });

  // Register plugins
  void server.register(requestIdPlugin);
  void server.register(securityHeadersPlugin);
  void server.register(authPlugin, { tokens: config.mcpClientTokens });
  void server.register(rateLimitPlugin, {
    limit: config.perClientRateLimit,
    windowMs: config.rateLimitWindowMs,
  });
  void server.register(errorHandlerPlugin, { nodeEnv: config.nodeEnv });

  // Initialize services
  const goveeClient = GoveeClient.fromConfig(config);
  const deviceService = new DeviceService(goveeClient, config);
  const controlService = new ControlService(deviceService, goveeClient, config);
  const toolService = new ToolService(deviceService, controlService);
  server.decorate('goveeClient', goveeClient);
  server.decorate('deviceService', deviceService);
  server.decorate('toolService', toolService);

  // Register routes
  void server.register(healthRoutes);
  void server.register(devicesRoutes);
  void server.register(mcpRoutes);
  void server.register(manifestRoutes);

  return server;
}
