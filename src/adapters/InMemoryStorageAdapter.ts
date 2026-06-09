import { StorageAdapter } from '../types';

export class InMemoryStorageAdapter implements StorageAdapter {
  private static sharedStorage: Map<string, any> = new Map();
  private storage: Map<string, any>;
  private useShared: boolean;

  constructor(useShared: boolean = false) {
    this.useShared = useShared;
    this.storage = useShared ? InMemoryStorageAdapter.sharedStorage : new Map();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.storage.get(key);
    return value !== undefined ? JSON.parse(JSON.stringify(value)) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, JSON.parse(JSON.stringify(value)));
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list<T>(prefix: string): Promise<T[]> {
    const items: T[] = [];
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        items.push(JSON.parse(JSON.stringify(value)));
      }
    }
    return items;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async count(prefix?: string): Promise<number> {
    if (prefix) {
      let count = 0;
      for (const key of this.storage.keys()) {
        if (key.startsWith(prefix)) {
          count++;
        }
      }
      return count;
    }
    return this.storage.size;
  }

  static clearShared(): void {
    InMemoryStorageAdapter.sharedStorage.clear();
  }

  static getSharedInstance(): InMemoryStorageAdapter {
    return new InMemoryStorageAdapter(true);
  }
}

export default InMemoryStorageAdapter;
