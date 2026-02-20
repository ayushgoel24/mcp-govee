import { FastifyError, FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import fp from 'fastify-plugin';
import { AppError, ErrorCode, mapZodError } from './errors.js';

export interface McpErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

function isFastifyError(error: unknown): error is FastifyError {
  return typeof error === 'object' && error !== null && 'code' in error && 'statusCode' in error;
}

function sanitizeMessage(message: string, isDevelopment: boolean): string {
  // In production, use generic messages for internal errors
  if (!isDevelopment && message.toLowerCase().includes('internal')) {
    return 'An internal error occurred';
  }
  return message;
}

export interface ErrorHandlerPluginOptions {
  nodeEnv: 'development' | 'production' | 'test';
}

async function errorHandlerPluginImpl(fastify: FastifyInstance, options: ErrorHandlerPluginOptions): Promise<void> {
  const isDevelopment = options.nodeEnv === 'development';

  fastify.setErrorHandler(
    async (error: Error, request: FastifyRequest, reply: FastifyReply): Promise<McpErrorResponse> => {
      const correlationId = request.id;

      // Handle Zod validation errors
      if (isZodError(error)) {
        const validationError = mapZodError(error);
        request.log.warn({ correlationId, err: error }, 'Validation error');
        return reply.code(400).send({
          ok: false,
          error: validationError.toJSON(),
        } satisfies McpErrorResponse);
      }

      // Handle AppError and its subclasses
      if (isAppError(error)) {
        const level = error.statusCode >= 500 ? 'error' : 'warn';
        request.log[level]({ correlationId, err: error }, error.message);
        return reply.code(error.statusCode).send({
          ok: false,
          error: error.toJSON(),
        } satisfies McpErrorResponse);
      }

      // Handle Fastify built-in errors
      if (isFastifyError(error)) {
        request.log.warn({ correlationId, err: error }, 'Fastify error');
        return reply.code(error.statusCode ?? 500).send({
          ok: false,
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: sanitizeMessage(error.message, isDevelopment),
          },
        } satisfies McpErrorResponse);
      }

      // Handle unknown errors
      request.log.error({ correlationId, err: error }, 'Unexpected error');
      return reply.code(500).send({
        ok: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: isDevelopment ? error.message : 'An internal error occurred',
        },
      } satisfies McpErrorResponse);
    }
  );
}

export const errorHandlerPlugin = fp(errorHandlerPluginImpl, {
  name: 'error-handler-plugin',
});
