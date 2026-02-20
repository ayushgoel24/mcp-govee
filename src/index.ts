import { createServer } from './server.js';
import { getConfig } from './config/index.js';

async function main(): Promise<void> {
  const config = getConfig();
  const server = createServer({ config });

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ signal }, 'Received shutdown signal, closing server...');
    try {
      await server.close();
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

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
