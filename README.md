# Govee MCP Server

An MCP-compatible HTTP service for controlling Govee smart bulbs via the Govee API.

## Features

- **MCP Protocol Support** - Standard `/mcp/invoke` endpoint for tool invocation
- **Device Control** - Turn lights on/off, adjust brightness, set colors
- **Device Discovery** - List and query available Govee devices
- **Authentication** - Token-based client authentication
- **Rate Limiting** - Per-client request throttling
- **Caching** - Device state caching to reduce API calls
- **Command Coalescing** - Batches rapid commands to prevent API flooding
- **Retry with Backoff** - Automatic retries for transient failures

## Prerequisites

- Node.js >= 20.0.0
- A Govee API key ([Get one here](https://developer.govee.com/))
- Govee smart bulbs registered to your account

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd govee-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `GOVEE_API_KEY` | Your Govee API key |
| `MCP_CLIENT_TOKENS` | Comma-separated list of valid client tokens for authentication |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment (`development`, `production`, `test`) |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `DEVICE_CACHE_TTL_MS` | `300000` | Device cache TTL in milliseconds (5 min) |
| `PER_CLIENT_RATE_LIMIT` | `60` | Max requests per client per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds (1 min) |
| `MAX_RETRIES` | `3` | Max retry attempts for Govee API calls |
| `INITIAL_BACKOFF_MS` | `1000` | Initial retry backoff |
| `MAX_BACKOFF_MS` | `10000` | Maximum retry backoff |
| `COALESCE_WINDOW_MS` | `200` | Command coalescing window |
| `DEFAULT_DEVICE_ID` | - | Default device ID for commands without explicit target |

## Usage

### Starting the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

### API Endpoints

#### Health Check

```bash
GET /healthz
```

Returns `200 OK` when the server is healthy.

#### List Devices

```bash
GET /devices
Headers:
  x-mcp-auth: <your-client-token>
```

Returns a list of all Govee devices associated with your account.

#### MCP Tool Invocation

```bash
POST /mcp/invoke
Headers:
  x-mcp-auth: <your-client-token>
  Content-Type: application/json

Body:
{
  "tool": "<tool-name>",
  "params": { ... }
}
```

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_devices` | List all available devices | None |
| `get_device_state` | Get current state of a device | `deviceId` |
| `turn_on` | Turn a device on | `deviceId` |
| `turn_off` | Turn a device off | `deviceId` |
| `set_brightness` | Set brightness level | `deviceId`, `brightness` (1-100) |
| `set_color` | Set RGB color | `deviceId`, `r`, `g`, `b` (0-255 each) |

### Example: Turn on a light

```bash
curl -X POST http://localhost:3000/mcp/invoke \
  -H "Content-Type: application/json" \
  -H "x-mcp-auth: your-token" \
  -d '{
    "tool": "turn_on",
    "params": {
      "deviceId": "AA:BB:CC:DD:EE:FF"
    }
  }'
```

## MCP Client Configuration

To use this server with an MCP client (e.g., Claude Desktop), add it to your MCP configuration:

```json
{
  "mcpServers": {
    "govee": {
      "url": "http://localhost:3000",
      "headers": {
        "x-mcp-auth": "your-client-token"
      }
    }
  }
}
```

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Architecture

```
src/
├── clients/        # External API clients (Govee)
├── config/         # Configuration management
├── middleware/     # Fastify middleware (auth, request ID, rate limiting)
├── routes/         # HTTP route handlers
├── schemas/        # Zod validation schemas
├── services/       # Business logic
├── types/          # TypeScript type definitions
└── utils/          # Utilities (cache, queue, retry, errors)
```

## Troubleshooting

### "Authentication required" error

Ensure you're including the `x-mcp-auth` header with a valid token that matches one in your `MCP_CLIENT_TOKENS` configuration.

### "Rate limit exceeded" error

You've exceeded the configured request rate. Wait for the rate limit window to reset or increase `PER_CLIENT_RATE_LIMIT`.

### Device not found

1. Verify the device ID is correct (MAC address format: `AA:BB:CC:DD:EE:FF`)
2. Ensure the device is registered to the Govee account associated with your API key
3. Try refreshing the device cache by restarting the server

### Govee API errors

The Govee API has its own rate limits. If you see 429 errors, the server will automatically retry with exponential backoff.

## License

MIT
