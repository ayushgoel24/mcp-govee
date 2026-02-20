# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-20

### Added
- Initial release of Govee MCP Server
- stdio transport support for MCP clients (Claude Desktop, etc.)
- HTTP API mode for custom integrations
- Full device control capabilities (on/off, brightness, color)
- Device discovery and state querying
- Token-based authentication for HTTP mode
- Per-client rate limiting with configurable windows
- Device state caching to minimize API calls
- Command coalescing to prevent API flooding
- Automatic retry with exponential backoff
- Comprehensive test suite (385+ tests)
- Docker support for containerized deployments
- Detailed documentation and troubleshooting guides

### Features
- `list_devices` - List all available Govee devices
- `get_device_state` - Query current device state
- `turn_on` - Turn device on
- `turn_off` - Turn device off
- `set_brightness` - Adjust brightness (1-100)
- `set_color` - Set RGB color (0-255 per channel)

### Technical
- Built with TypeScript 5.5
- Uses Fastify for HTTP server
- MCP SDK v1.26.0 for stdio transport
- Zod for schema validation
- Vitest for testing with coverage
- ESLint for code quality
- Node.js >= 20.0.0 required

[1.0.0]: https://github.com/ayushgoel24/govee-mcp-server/releases/tag/v1.0.0
