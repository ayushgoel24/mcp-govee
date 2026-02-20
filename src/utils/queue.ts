export interface QueuedCommand {
  type: 'turn' | 'brightness' | 'color';
  params: unknown;
  timestamp: number;
  correlationId: string;
}

export interface CommandResult {
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

type CommandExecutor = (command: QueuedCommand) => Promise<CommandResult>;

interface QueueEntry {
  command: QueuedCommand;
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

/**
 * Per-device command queue that processes commands sequentially
 * to prevent rate limiting and ensure ordered execution.
 */
export class DeviceQueue {
  private readonly queues: Map<string, QueueEntry[]> = new Map();
  private readonly processing: Map<string, boolean> = new Map();
  private readonly executor: CommandExecutor;

  constructor(executor: CommandExecutor) {
    this.executor = executor;
  }

  /**
   * Enqueue a command for a specific device.
   * Returns a promise that resolves when the command is processed.
   */
  enqueue(deviceId: string, command: QueuedCommand): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      // Get or create queue for this device
      let queue = this.queues.get(deviceId);
      if (queue === undefined) {
        queue = [];
        this.queues.set(deviceId, queue);
      }

      // Add command to queue
      queue.push({ command, resolve, reject });

      // Start processing if not already running
      void this.processQueue(deviceId);
    });
  }

  /**
   * Get the current queue depth for a device.
   */
  getDepth(deviceId: string): number {
    const queue = this.queues.get(deviceId);
    return queue?.length ?? 0;
  }

  /**
   * Get the total number of commands across all queues.
   */
  getTotalDepth(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Check if a device queue is currently processing.
   */
  isProcessing(deviceId: string): boolean {
    return this.processing.get(deviceId) ?? false;
  }

  /**
   * Get all device IDs that have pending commands.
   */
  getActiveDevices(): string[] {
    const active: string[] = [];
    for (const [deviceId, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        active.push(deviceId);
      }
    }
    return active;
  }

  /**
   * Clear all queues (useful for shutdown).
   * Returns the number of commands that were cleared.
   */
  clear(): number {
    let cleared = 0;
    for (const queue of this.queues.values()) {
      for (const entry of queue) {
        entry.reject(new Error('Queue cleared'));
        cleared++;
      }
    }
    this.queues.clear();
    this.processing.clear();
    return cleared;
  }

  /**
   * Process the queue for a specific device.
   * Commands are processed sequentially.
   */
  private async processQueue(deviceId: string): Promise<void> {
    // Check if already processing this device's queue
    if (this.processing.get(deviceId)) {
      return;
    }

    this.processing.set(deviceId, true);

    try {
      const queue = this.queues.get(deviceId);

      while (queue !== undefined && queue.length > 0) {
        const entry = queue.shift();
        if (entry === undefined) break;

        try {
          const result = await this.executor(entry.command);
          entry.resolve(result);
        } catch (error) {
          if (error instanceof Error) {
            entry.reject(error);
          } else {
            entry.reject(new Error('Unknown error during command execution'));
          }
        }
      }
    } finally {
      this.processing.set(deviceId, false);
    }
  }
}
