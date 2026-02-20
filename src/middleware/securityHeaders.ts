import { FastifyInstance } from 'fastify';

/**
 * Security headers middleware for API responses.
 *
 * Since this is an API-only server (no HTML rendering), we include
 * headers relevant to API security rather than browser-based XSS protection.
 */
export async function securityHeadersPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onSend', async (_request, reply) => {
    // Prevent MIME type sniffing
    void reply.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking (if responses are ever rendered in browser)
    void reply.header('X-Frame-Options', 'DENY');

    // Disable caching for API responses (they may contain sensitive data)
    void reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    void reply.header('Pragma', 'no-cache');

    // Remove server identification header
    void reply.header('X-Powered-By', '');

    // Referrer policy - don't leak URLs
    void reply.header('Referrer-Policy', 'no-referrer');

    // Permissions policy - disable browser features
    void reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  });
}
