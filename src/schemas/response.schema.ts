import { z } from 'zod';

export const mcpSuccessResponseSchema = z.object({
  ok: z.literal(true),
  result: z.unknown(),
});

export type McpSuccessResponse = z.infer<typeof mcpSuccessResponseSchema>;

export const mcpErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type McpError = z.infer<typeof mcpErrorSchema>;

export const mcpErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: mcpErrorSchema,
});

export type McpErrorResponse = z.infer<typeof mcpErrorResponseSchema>;

export const mcpResponseSchema = z.discriminatedUnion('ok', [
  mcpSuccessResponseSchema,
  mcpErrorResponseSchema,
]);

export type McpResponse = z.infer<typeof mcpResponseSchema>;
