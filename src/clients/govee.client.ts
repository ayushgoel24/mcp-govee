import type { Config } from '../config/index.js';
import type {
  GoveeDevice,
  GoveeDeviceListResponse,
  GoveeApiResponse,
  GoveeControlParams,
} from '../types/index.js';
import { GoveeApiError } from '../utils/errors.js';
import { RetryHandler, type RetryLogger } from '../utils/retry.js';

const GOVEE_API_BASE_URL = 'https://developer-api.govee.com';
const REQUEST_TIMEOUT_MS = 10000;

export interface GoveeClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  logger?: RetryLogger;
}

export class GoveeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly logger?: RetryLogger;

  constructor(options: GoveeClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? GOVEE_API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 10000;
    this.logger = options.logger;
  }

  static fromConfig(config: Config, logger?: RetryLogger): GoveeClient {
    return new GoveeClient({
      apiKey: config.goveeApiKey,
      maxRetries: config.maxRetries,
      initialBackoffMs: config.initialBackoffMs,
      maxBackoffMs: config.maxBackoffMs,
      logger,
    });
  }

  /**
   * Get all devices from Govee API
   */
  async getDevices(correlationId?: string): Promise<GoveeDevice[]> {
    const response = await this.requestWithRetry<GoveeDeviceListResponse>(
      'GET',
      '/v1/devices',
      undefined,
      correlationId
    );
    return response.data.devices;
  }

  /**
   * Send control command to a device
   */
  async controlDevice(params: GoveeControlParams, correlationId?: string): Promise<GoveeApiResponse> {
    return this.requestWithRetry<GoveeApiResponse>(
      'PUT',
      '/v1/devices/control',
      params,
      correlationId
    );
  }

  /**
   * Health check - verify API is reachable
   * Returns true if API responds, false otherwise
   * Note: Health check does NOT retry - single attempt only
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<GoveeDeviceListResponse>('GET', '/v1/devices');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a request with retry logic for transient failures.
   * Retries on 429, 5xx, and network timeouts.
   */
  private async requestWithRetry<T>(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    body?: unknown,
    correlationId?: string
  ): Promise<T> {
    const retryHandler = new RetryHandler({
      maxRetries: this.maxRetries,
      initialBackoffMs: this.initialBackoffMs,
      maxBackoffMs: this.maxBackoffMs,
      correlationId,
      logger: this.logger,
    });

    return retryHandler.execute(() => this.request<T>(method, path, body));
  }

  /**
   * Make an HTTP request to the Govee API
   */
  private async request<T>(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Govee-API-Key': this.apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as T;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw GoveeApiError.unavailable('Govee API request timed out');
      }

      // Re-throw GoveeApiError
      if (error instanceof GoveeApiError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw GoveeApiError.unavailable('Failed to connect to Govee API');
      }

      // Unknown error
      throw GoveeApiError.unavailable('Unknown error communicating with Govee API');
    }
  }

  /**
   * Handle non-2xx HTTP responses
   * Note: Never exposes API key in error messages
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = 'Govee API error';

    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }

    switch (response.status) {
      case 400:
        throw GoveeApiError.apiError(errorMessage, 400);
      case 401:
        // Don't expose that it's an API key issue
        throw GoveeApiError.apiError('Govee API authentication failed', 401);
      case 429:
        throw GoveeApiError.rateLimited();
      default:
        if (response.status >= 500) {
          throw GoveeApiError.unavailable(`Govee API server error: ${response.status}`);
        }
        throw GoveeApiError.apiError(errorMessage, response.status);
    }
  }
}
