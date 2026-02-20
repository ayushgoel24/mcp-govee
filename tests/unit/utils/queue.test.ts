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
});
