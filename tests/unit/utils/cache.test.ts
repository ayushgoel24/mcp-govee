import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '../../../src/utils/cache.js';

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const cache = new LRUCache<string>();
      expect(cache.size()).toBe(0);
    });

    it('should create cache with custom options', () => {
      const cache = new LRUCache<string>({
        defaultTtlMs: 60000,
        maxSize: 100,
      });
      expect(cache.size()).toBe(0);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');

      const entry = cache.get('key1');

      expect(entry).not.toBeNull();
      expect(entry!.value).toBe('value1');
    });

    it('should return CacheEntry with cachedAt and expiresAt', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 60000 });
      const now = Date.now();
      vi.setSystemTime(now);

      cache.set('key1', 'value1');
      const entry = cache.get('key1');

      expect(entry).not.toBeNull();
      expect(entry!.cachedAt).toBe(now);
      expect(entry!.expiresAt).toBe(now + 60000);
    });

    it('should use custom TTL when provided', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 60000 });
      const now = Date.now();
      vi.setSystemTime(now);

      cache.set('key1', 'value1', 30000);
      const entry = cache.get('key1');

      expect(entry!.expiresAt).toBe(now + 30000);
    });

    it('should return null for non-existent key', () => {
      const cache = new LRUCache<string>();
      const entry = cache.get('nonexistent');
      expect(entry).toBeNull();
    });

    it('should update existing key', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');

      const entry = cache.get('key1');
      expect(entry!.value).toBe('value2');
      expect(cache.size()).toBe(1);
    });
  });

  describe('TTL expiration', () => {
    it('should return null for expired entry', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 1000 });
      cache.set('key1', 'value1');

      // Advance time past TTL
      vi.advanceTimersByTime(1001);

      const entry = cache.get('key1');
      expect(entry).toBeNull();
    });

    it('should return entry just before expiration', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 1000 });
      cache.set('key1', 'value1');

      // Advance time to just before TTL
      vi.advanceTimersByTime(999);

      const entry = cache.get('key1');
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe('value1');
    });

    it('should remove expired entry from cache', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 1000 });
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1001);

      cache.get('key1'); // This should trigger removal
      expect(cache.size()).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when at max size', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).not.toBeNull();
      expect(cache.get('key3')).not.toBeNull();
      expect(cache.get('key4')).not.toBeNull();
      expect(cache.size()).toBe(3);
    });

    it('should update LRU order on get', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it most recently used
      cache.get('key1');

      // Add new item, should evict key2 (now least recently used)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).not.toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).not.toBeNull();
      expect(cache.get('key4')).not.toBeNull();
    });

    it('should not evict when updating existing key', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update existing key should not trigger eviction
      cache.set('key1', 'updated');

      expect(cache.get('key1')!.value).toBe('updated');
      expect(cache.get('key2')).not.toBeNull();
      expect(cache.get('key3')).not.toBeNull();
      expect(cache.size()).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete an existing key', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');

      const result = cache.delete('key1');

      expect(result).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('should return false when deleting non-existent key', () => {
      const cache = new LRUCache<string>();
      const result = cache.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired key', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');

      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      const cache = new LRUCache<string>();
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired key', () => {
      const cache = new LRUCache<string>({ defaultTtlMs: 1000 });
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1001);

      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      const cache = new LRUCache<string>();

      expect(cache.size()).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('cache age calculation', () => {
    it('should calculate cache age in milliseconds', () => {
      const cache = new LRUCache<string>();
      const now = Date.now();
      vi.setSystemTime(now);

      cache.set('key1', 'value1');

      vi.advanceTimersByTime(5000);

      const entry = cache.get('key1');
      const age = LRUCache.getCacheAge(entry!);

      expect(age).toBe(5000);
    });

    it('should calculate cache age in seconds', () => {
      const cache = new LRUCache<string>();
      const now = Date.now();
      vi.setSystemTime(now);

      cache.set('key1', 'value1');

      vi.advanceTimersByTime(5500);

      const entry = cache.get('key1');
      const ageSeconds = LRUCache.getCacheAgeSeconds(entry!);

      expect(ageSeconds).toBe(5);
    });

    it('should return 0 age for freshly cached entry', () => {
      const cache = new LRUCache<string>();
      cache.set('key1', 'value1');

      const entry = cache.get('key1');
      const age = LRUCache.getCacheAge(entry!);

      expect(age).toBe(0);
    });
  });

  describe('complex data types', () => {
    it('should store and retrieve objects', () => {
      interface TestObject {
        id: string;
        name: string;
        count: number;
      }

      const cache = new LRUCache<TestObject>();
      const obj: TestObject = { id: '123', name: 'test', count: 42 };

      cache.set('obj1', obj);
      const entry = cache.get('obj1');

      expect(entry!.value).toEqual(obj);
    });

    it('should store and retrieve arrays', () => {
      const cache = new LRUCache<string[]>();
      const arr = ['a', 'b', 'c'];

      cache.set('arr1', arr);
      const entry = cache.get('arr1');

      expect(entry!.value).toEqual(arr);
    });
  });
});
