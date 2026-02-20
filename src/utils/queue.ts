export interface QueuedCommand {
  type: 'turn' | 'brightness' | 'color';
  params: unknown;
  timestamp: number;
  correlationId: string;
  /** Correlation IDs of commands that were merged into this one */
  mergedCorrelationIds?: string[];
}

export interface CommandResult {
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  /** Correlation IDs of all commands that contributed to this result */
  correlationIds?: string[];
}

type CommandExecutor = (command: QueuedCommand) => Promise<CommandResult>;

interface QueueEntry {
  command: QueuedCommand;
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

export interface DeviceQueueOptions {
  /** Coalesce window in milliseconds. Commands of the same type within this window are merged. Default: 0 (disabled) */
  coalesceWindowMs?: number;
}

/**
 * Per-device command queue that processes commands sequentially
 * to prevent rate limiting and ensure ordered execution.
 *
 * Supports command coalescing: commands of the same type within
 * the coalesce window are merged using last-write-wins semantics.
 */
export class DeviceQueue {
  private readonly queues: Map<string, QueueEntry[]> = new Map();
  private readonly processing: Map<string, boolean> = new Map();
  private readonly executor: CommandExecutor;
  private readonly coalesceWindowMs: number;

  constructor(executor: CommandExecutor, options: DeviceQueueOptions = {}) {
    this.executor = executor;
    this.coalesceWindowMs = options.coalesceWindowMs ?? 0;
  }

  /**
   * Enqueue a command for a specific device.
   * Returns a promise that resolves when the command is processed.
   *
   * If coalescing is enabled and there's a pending command of the same type
   * within the coalesce window, the new command replaces it (last-write-wins).
   */
  enqueue(deviceId: string, command: QueuedCommand): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      // Get or create queue for this device
      let queue = this.queues.get(deviceId);
      if (queue === undefined) {
        queue = [];
        this.queues.set(deviceId, queue);
      }

      // Try to coalesce with existing command
      if (this.coalesceWindowMs > 0) {
        const coalesced = this.tryCoalesce(queue, command, resolve, reject);
        if (coalesced) {
          // Command was merged - don't add a new entry
          return;
        }
      }

      // Add command to queue
      queue.push({ command, resolve, reject });

      // Start processing if not already running
      void this.processQueue(deviceId);
    });
  }

  /**
   * Try to coalesce a new command with an existing pending command.
   * Returns true if the command was merged, false otherwise.
   */
  private tryCoalesce(
    queue: QueueEntry[],
    newCommand: QueuedCommand,
    newResolve: (result: CommandResult) => void,
    newReject: (error: Error) => void
  ): boolean {
    const now = newCommand.timestamp;

    // Find the last pending command of the same type within the coalesce window
    for (let i = queue.length - 1; i >= 0; i--) {
      const entry = queue[i];
      if (entry === undefined) continue;

      const existingCommand = entry.command;

      // Check if same command type
      if (existingCommand.type !== newCommand.type) {
        continue;
      }

      // Check if within coalesce window
      const age = now - existingCommand.timestamp;
      if (age > this.coalesceWindowMs) {
        continue;
      }

      // Found a command to coalesce with - use last-write-wins
      // Collect all merged correlation IDs
      const mergedIds = [
        existingCommand.correlationId,
        ...(existingCommand.mergedCorrelationIds ?? []),
      ];

      // Create merged command with new params but preserving merged IDs
      const mergedCommand: QueuedCommand = {
        type: newCommand.type,
        params: newCommand.params, // Last-write-wins
        timestamp: newCommand.timestamp,
        correlationId: newCommand.correlationId,
        mergedCorrelationIds: mergedIds,
      };

      // Create a combined resolver that notifies both callers
      const originalResolve = entry.resolve;
      const originalReject = entry.reject;

      const combinedResolve = (result: CommandResult): void => {
        // Add all correlation IDs to the result
        const allIds = [
          mergedCommand.correlationId,
          ...(mergedCommand.mergedCorrelationIds ?? []),
        ];
        const resultWithIds: CommandResult = {
          ...result,
          correlationIds: allIds,
        };
        originalResolve(resultWithIds);
        newResolve(resultWithIds);
      };

      const combinedReject = (error: Error): void => {
        originalReject(error);
        newReject(error);
      };

      // Replace the queue entry
      queue[i] = {
        command: mergedCommand,
        resolve: combinedResolve,
        reject: combinedReject,
      };

      return true;
    }

    return false;
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
