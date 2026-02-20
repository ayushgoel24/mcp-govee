import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mcpInvokeSchema } from '../schemas/control.schema.js';
import { authenticate } from '../middleware/auth.js';
import { mapZodError } from '../utils/errors.js';
import type { ToolResult } from '../services/tool.service.js';

interface McpInvokeBody {
  tool: string;
  params?: Record<string, unknown>;
}

interface McpSuccessResponse {
  ok: true;
  result: unknown;
}

interface McpErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type McpResponse = McpSuccessResponse | McpErrorResponse;

export async function mcpRoutes(server: FastifyInstance): Promise<void> {
  server.post<{
    Body: McpInvokeBody;
    Reply: McpResponse;
  }>(
    '/mcp/invoke',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest<{ Body: McpInvokeBody }>, _reply: FastifyReply): Promise<McpResponse> => {
      // Validate request body against schema
      const parseResult = mcpInvokeSchema.safeParse(request.body);
      if (!parseResult.success) {
        const validationError = mapZodError(parseResult.error);
        return {
          ok: false,
          error: {
            code: validationError.code,
            message: validationError.message,
          },
        };
      }

      const { tool, params } = parseResult.data;

      // Invoke the tool
      const toolService = server.toolService;
      const result: ToolResult = await toolService.invoke(tool, params);

      if (result.ok) {
        return {
          ok: true,
          result: result.result,
        };
      }

      return {
        ok: false,
        error: result.error!,
      };
    }
  );
}
