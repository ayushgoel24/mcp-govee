import { createServer } from './server.js';
import { getConfig } from './config/index.js';

// Shutdown timeout in milliseconds (30 seconds)
const SHUTDOWN_TIMEOUT_MS = 30000;

async function main(): Promise<void> {
  const config = getConfig();
  const server = createServer({ config });

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
      server.log.warn({ signal }, 'Shutdown already in progress, ignoring signal');
      return;
    }
    isShuttingDown = true;

    server.log.info({ signal }, 'Received shutdown signal, initiating graceful shutdown...');

    // Set up shutdown timeout
    const timeoutId = setTimeout(() => {
      server.log.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Step 1: Stop accepting new connections
      server.log.info('Stopping new connections...');

      // Step 2: Wait for in-flight requests to complete
      // Fastify's close() handles this automatically
      server.log.info('Waiting for in-flight requests to complete...');
      await server.close();

      // Step 3: Drain device queues (if available)
      // The deviceService may have pending operations
      if (server.deviceService) {
        server.log.info('Invalidating device cache...');
        server.deviceService.invalidateCache();
      }

      clearTimeout(timeoutId);
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      clearTimeout(timeoutId);
      server.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  // Handle SIGTERM (container orchestration, systemd)
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C during local development)
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught exceptions during shutdown
  process.on('uncaughtException', (err) => {
    server.log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    server.log.error({ reason, promise }, 'Unhandled promise rejection');
  });

  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });
    server.log.info(`Server listening on ${config.host}:${config.port}`);
  } catch (err) {
    server.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
