import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceQueue, QueuedCommand, CommandResult } from '../../../src/utils/queue.js';

describe('DeviceQueue', () => {
  let mockExecutor: ReturnType<typeof vi.fn>;
  let queue: DeviceQueue;

  const createCommand = (type: 'turn' | 'brightness' | 'color', params: unknown): QueuedCommand => ({
    type,
    params,
    timestamp: Date.now(),
    correlationId: `test-${Date.now()}`,
  });

  beforeEach(() => {
    mockExecutor = vi.fn();
    queue = new DeviceQueue(mockExecutor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should execute a single command', async () => {
      const command = createCommand('turn', { power: 'on' });
      mockExecutor.mockResolvedValue({ ok: true, result: 'success' });

      const result = await queue.enqueue('device-1', command);

      expect(result.ok).toBe(true);
      expect(result.result).toBe('success');
      expect(mockExecutor).toHaveBeenCalledWith(command);
    });

    it('should process commands sequentially for the same device', async () => {
      const executionOrder: number[] = [];

      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        const order = (cmd.params as { order: number }).order;
        executionOrder.push(order);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ok: true, result: order };
      });

      const command1 = createCommand('turn', { order: 1 });
      const command2 = createCommand('turn', { order: 2 });
      const command3 = createCommand('turn', { order: 3 });

      const promises = [
        queue.enqueue('device-1', command1),
        queue.enqueue('device-1', command2),
        queue.enqueue('device-1', command3),
      ];

      await Promise.all(promises);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should process commands in parallel for different devices', async () => {
      const executionStartTimes: Map<string, number> = new Map();

      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        const deviceId = (cmd.params as { deviceId: string }).deviceId;
        executionStartTimes.set(deviceId, Date.now());
        await new Promise(resolve => setTimeout(resolve, 50));
        return { ok: true };
      });

      const command1 = createCommand('turn', { deviceId: 'device-1' });
      const command2 = createCommand('turn', { deviceId: 'device-2' });

      const startTime = Date.now();
      await Promise.all([
        queue.enqueue('device-1', command1),
        queue.enqueue('device-2', command2),
      ]);
      const endTime = Date.now();

      // Both commands should have started at approximately the same time
      const start1 = executionStartTimes.get('device-1')!;
      const start2 = executionStartTimes.get('device-2')!;
      expect(Math.abs(start1 - start2)).toBeLessThan(20);

      // Total time should be around 50ms (parallel), not 100ms (sequential)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle executor errors', async () => {
      mockExecutor.mockRejectedValue(new Error('Execution failed'));

      const command = createCommand('turn', { power: 'on' });

      await expect(queue.enqueue('device-1', command)).rejects.toThrow('Execution failed');
    });

    it('should continue processing after an error', async () => {
      mockExecutor
        .mockRejectedValueOnce(new Error('First command failed'))
        .mockResolvedValueOnce({ ok: true, result: 'success' });

      const command1 = createCommand('turn', { order: 1 });
      const command2 = createCommand('turn', { order: 2 });

      const promise1 = queue.enqueue('device-1', command1);
      const promise2 = queue.enqueue('device-1', command2);

      await expect(promise1).rejects.toThrow('First command failed');
      const result2 = await promise2;
      expect(result2.ok).toBe(true);
    });
  });

  describe('getDepth', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.getDepth('device-1')).toBe(0);
    });

    it('should return correct depth', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      // Start first command (it will be processing)
      queue.enqueue('device-1', createCommand('turn', { order: 1 }));

      // Add more commands while first is processing
      await new Promise(resolve => setTimeout(resolve, 10));
      queue.enqueue('device-1', createCommand('turn', { order: 2 }));
      queue.enqueue('device-1', createCommand('turn', { order: 3 }));

      // Queue should have 2 pending (the first one is being processed)
      expect(queue.getDepth('device-1')).toBe(2);
    });
  });

  describe('getTotalDepth', () => {
    it('should return 0 for empty queues', () => {
      expect(queue.getTotalDepth()).toBe(0);
    });

    it('should return total across all devices', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      queue.enqueue('device-1', createCommand('turn', {}));
      queue.enqueue('device-1', createCommand('turn', {}));
      queue.enqueue('device-2', createCommand('turn', {}));

      await new Promise(resolve => setTimeout(resolve, 10));

      // 1 pending on device-1, 0 pending on device-2 (both first commands are processing)
      expect(queue.getTotalDepth()).toBe(1);
    });
  });

  describe('isProcessing', () => {
    it('should return false for idle device', () => {
      expect(queue.isProcessing('device-1')).toBe(false);
    });

    it('should return true while processing', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      const promise = queue.enqueue('device-1', createCommand('turn', {}));

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(queue.isProcessing('device-1')).toBe(true);

      await promise;
      expect(queue.isProcessing('device-1')).toBe(false);
    });
  });

  describe('getActiveDevices', () => {
    it('should return empty array when no active devices', () => {
      expect(queue.getActiveDevices()).toEqual([]);
    });

    it('should return devices with pending commands', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      queue.enqueue('device-1', createCommand('turn', {}));
      queue.enqueue('device-1', createCommand('turn', {}));
      queue.enqueue('device-2', createCommand('turn', {}));

      await new Promise(resolve => setTimeout(resolve, 10));

      const active = queue.getActiveDevices();
      expect(active).toContain('device-1');
      // device-2 may or may not be active depending on timing
    });
  });

  describe('clear', () => {
    it('should clear all queues and reject pending commands', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      const promise1 = queue.enqueue('device-1', createCommand('turn', {}));
      const promise2 = queue.enqueue('device-1', createCommand('turn', {}));
      const promise3 = queue.enqueue('device-2', createCommand('turn', {}));

      await new Promise(resolve => setTimeout(resolve, 10));

      const cleared = queue.clear();

      // The first commands for each device are processing, so only 1 was cleared
      expect(cleared).toBe(1);

      // Pending commands should be rejected
      await expect(promise2).rejects.toThrow('Queue cleared');

      expect(queue.getTotalDepth()).toBe(0);
      expect(queue.getActiveDevices()).toEqual([]);
    });
  });

  describe('coalescing', () => {
    let coalescingQueue: DeviceQueue;
    const COALESCE_WINDOW = 200; // ms

    const createCommandWithId = (
      type: 'turn' | 'brightness' | 'color',
      params: unknown,
      correlationId: string,
      timestamp?: number
    ): QueuedCommand => ({
      type,
      params,
      timestamp: timestamp ?? Date.now(),
      correlationId,
    });

    beforeEach(() => {
      mockExecutor = vi.fn();
      coalescingQueue = new DeviceQueue(mockExecutor, { coalesceWindowMs: COALESCE_WINDOW });
    });

    it('should merge same-type commands waiting in queue', async () => {
      // First command takes a while to process
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true, result: 'executed' };
      });

      const now = Date.now();
      // First command - starts processing immediately
      const command0 = createCommandWithId('turn', { power: 'on' }, 'cmd-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      // Wait for first command to start processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // These two commands will wait in queue and should be merged
      const command1 = createCommandWithId('brightness', { level: 50 }, 'cmd-1', now + 20);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'cmd-2', now + 30);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);

      await Promise.all([promise0, promise1, promise2]);

      // First turn command + merged brightness command = 2 calls
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it('should use last-write-wins for merged commands', async () => {
      const executedParams: unknown[] = [];
      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        executedParams.push(cmd.params);
        return { ok: true };
      });

      const now = Date.now();
      // First command occupies the executor
      const command0 = createCommandWithId('turn', { power: 'on' }, 'cmd-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // These commands wait in queue and get merged
      const command1 = createCommandWithId('brightness', { level: 50 }, 'cmd-1', now + 20);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'cmd-2', now + 30);
      const command3 = createCommandWithId('brightness', { level: 100 }, 'cmd-3', now + 40);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);
      const promise3 = coalescingQueue.enqueue('device-1', command3);

      await Promise.all([promise0, promise1, promise2, promise3]);

      // Should have executed: turn command, then merged brightness command
      expect(executedParams).toHaveLength(2);
      // Last command's params should have been used (last-write-wins)
      expect(executedParams[1]).toEqual({ level: 100 });
    });

    it('should preserve correlation IDs of merged commands', async () => {
      const executedCommands: QueuedCommand[] = [];
      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        executedCommands.push(cmd);
        return { ok: true };
      });

      const now = Date.now();
      // First command occupies the executor
      const command0 = createCommandWithId('turn', { power: 'on' }, 'corr-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // These commands wait in queue and get merged
      const command1 = createCommandWithId('brightness', { level: 50 }, 'corr-1', now + 20);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'corr-2', now + 30);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);

      await Promise.all([promise0, promise1, promise2]);

      // Find the merged brightness command
      const brightnessCmd = executedCommands.find(c => c.type === 'brightness');
      expect(brightnessCmd).toBeDefined();
      expect(brightnessCmd?.correlationId).toBe('corr-2'); // Last one
      expect(brightnessCmd?.mergedCorrelationIds).toContain('corr-1'); // First one
    });

    it('should include all correlation IDs in result', async () => {
      mockExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      const now = Date.now();
      // First command occupies the executor
      const command0 = createCommandWithId('turn', { power: 'on' }, 'corr-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // These commands wait in queue and get merged
      const command1 = createCommandWithId('color', { r: 255, g: 0, b: 0 }, 'corr-1', now + 20);
      const command2 = createCommandWithId('color', { r: 0, g: 255, b: 0 }, 'corr-2', now + 30);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);

      const [, result1, result2] = await Promise.all([promise0, promise1, promise2]);

      // Both results should contain all correlation IDs
      expect(result1.correlationIds).toBeDefined();
      expect(result1.correlationIds).toContain('corr-1');
      expect(result1.correlationIds).toContain('corr-2');
      expect(result2.correlationIds).toEqual(result1.correlationIds);
    });

    it('should NOT merge different command types', async () => {
      const executedCommands: QueuedCommand[] = [];
      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        executedCommands.push(cmd);
        return { ok: true };
      });

      const now = Date.now();
      const command1 = createCommandWithId('turn', { power: 'on' }, 'cmd-1', now);
      const command2 = createCommandWithId('brightness', { level: 50 }, 'cmd-2', now + 50);

      coalescingQueue.enqueue('device-1', command1);
      await new Promise(resolve => setTimeout(resolve, 10));
      coalescingQueue.enqueue('device-1', command2);

      await new Promise(resolve => setTimeout(resolve, 200));

      // Both commands should have been executed separately
      expect(executedCommands).toHaveLength(2);
      expect(executedCommands[0].type).toBe('turn');
      expect(executedCommands[1].type).toBe('brightness');
    });

    it('should NOT merge commands outside coalesce window', async () => {
      const executedCommands: QueuedCommand[] = [];
      mockExecutor.mockImplementation(async (cmd: QueuedCommand) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        executedCommands.push(cmd);
        return { ok: true };
      });

      const now = Date.now();
      // First command occupies the executor
      const command0 = createCommandWithId('turn', { power: 'on' }, 'cmd-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // Commands with timestamps far apart (beyond coalesce window)
      const command1 = createCommandWithId('brightness', { level: 50 }, 'cmd-1', now - 500);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'cmd-2', now + 20);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);

      await Promise.all([promise0, promise1, promise2]);

      // All should execute since brightness commands are outside the window
      expect(executedCommands).toHaveLength(3);
    });

    it('should not coalesce when disabled (coalesceWindowMs = 0)', async () => {
      const executedCommands: QueuedCommand[] = [];
      const noCoalesceQueue = new DeviceQueue(async (cmd: QueuedCommand) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        executedCommands.push(cmd);
        return { ok: true };
      }); // No options = coalesceWindowMs defaults to 0

      const now = Date.now();
      // First command occupies executor
      const command0 = createCommandWithId('turn', { power: 'on' }, 'cmd-0', now);
      const promise0 = noCoalesceQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // These would normally be merged but coalescing is disabled
      const command1 = createCommandWithId('brightness', { level: 50 }, 'cmd-1', now + 20);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'cmd-2', now + 30);

      const promise1 = noCoalesceQueue.enqueue('device-1', command1);
      const promise2 = noCoalesceQueue.enqueue('device-1', command2);

      await Promise.all([promise0, promise1, promise2]);

      // All should execute since coalescing is disabled
      expect(executedCommands).toHaveLength(3);
    });

    it('should handle errors in merged commands', async () => {
      let callCount = 0;
      mockExecutor.mockImplementation(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        if (callCount === 1) {
          return { ok: true }; // First command succeeds
        }
        throw new Error('Command failed'); // Merged command fails
      });

      const now = Date.now();
      // First command succeeds
      const command0 = createCommandWithId('turn', { power: 'on' }, 'cmd-0', now);
      const promise0 = coalescingQueue.enqueue('device-1', command0);

      await new Promise(resolve => setTimeout(resolve, 10));

      // These get merged and fail
      const command1 = createCommandWithId('brightness', { level: 50 }, 'cmd-1', now + 20);
      const command2 = createCommandWithId('brightness', { level: 75 }, 'cmd-2', now + 30);

      const promise1 = coalescingQueue.enqueue('device-1', command1);
      const promise2 = coalescingQueue.enqueue('device-1', command2);

      const result0 = await promise0;
      expect(result0.ok).toBe(true);

      // Both merged commands should reject with the same error
      await expect(promise1).rejects.toThrow('Command failed');
      await expect(promise2).rejects.toThrow('Command failed');
    });
  });
});
