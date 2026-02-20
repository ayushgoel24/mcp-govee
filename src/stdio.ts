#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getConfig } from './config/index.js';
import { GoveeClient } from './clients/govee.client.js';
import { DeviceService } from './services/device.service.js';
import { ControlService } from './services/control.service.js';
import { ToolService } from './services/tool.service.js';

// Log to stderr to avoid interfering with MCP protocol on stdout
function log(message: string): void {
  process.stderr.write(`[govee-mcp] ${message}\n`);
}

async function main(): Promise<void> {
  const config = getConfig();

  // Initialize services
  const goveeClient = GoveeClient.fromConfig(config);
  const deviceService = new DeviceService(goveeClient, config);
  const controlService = new ControlService(deviceService, goveeClient, config);
  const toolService = new ToolService(deviceService, controlService);

  // Create MCP server
  const server = new Server(
    {
      name: 'govee-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const manifest = toolService.getManifest();
    return {
      tools: manifest.tools.map((tool) => ({
        name: tool.id,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: tool.input_schema.properties,
          required: tool.input_schema.required,
        },
      })),
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    log(`Tool call: ${name}`);
    const result = await toolService.invoke(name, args ?? {});

    if (result.ok) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result.result, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${result.error?.message ?? 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('Server started');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
