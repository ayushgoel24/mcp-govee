import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { getConfig, type Config } from './config/index.js';

export interface ServerOptions {
  config?: Config;
}

export function createServer(options: ServerOptions = {}): FastifyInstance {
  const config = options.config ?? getConfig();

  const server = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(request: FastifyRequest): Record<string, unknown> {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            requestId: request.id,
          };
        },
        res(reply): Record<string, unknown> {
          return {
            statusCode: reply.statusCode,
          };
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

  return server;
}
