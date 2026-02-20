/**
 * LRU Cache implementation for device data caching
 */

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

export interface CacheOptions {
  defaultTtlMs?: number;
  maxSize?: number;
}

export interface Cache<T> {
  get(key: string): CacheEntry<T> | null;
  set(key: string, value: T, ttlMs?: number): void;
  delete(key: string): boolean;
  clear(): void;
  has(key: string): boolean;
  size(): number;
}

export class LRUCache<T> implements Cache<T> {
  private readonly cache: Map<string, CacheEntry<T>>;
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.defaultTtlMs = options.defaultTtlMs ?? 300000; // 5 minutes default
    this.maxSize = options.maxSize ?? 1000;
  }

  /**
   * Get a value from the cache
   * Returns null if not found or expired
   */
  get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end for LRU (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;

    // If at max size, remove the least recently used item (first item)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    // Remove existing entry to update position
    this.cache.delete(key);

    const entry: CacheEntry<T> = {
      value,
      cachedAt: now,
      expiresAt: now + ttl,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete a value from the cache
   * Returns true if the key existed
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.get(key);
    return entry !== null;
  }

  /**
   * Get the current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Calculate the age of a cache entry in milliseconds
   */
  static getCacheAge(entry: CacheEntry<unknown>): number {
    return Date.now() - entry.cachedAt;
  }

  /**
   * Calculate the age of a cache entry in seconds
   */
  static getCacheAgeSeconds(entry: CacheEntry<unknown>): number {
    return Math.floor(LRUCache.getCacheAge(entry) / 1000);
  }
}
