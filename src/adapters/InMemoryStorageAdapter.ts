import { StorageAdapter } from '../types';

export interface StorageExportData {
  version: number;
  namespace: string;
  data: Record<string, any>;
  exportedAt: number;
  count: number;
}

export interface MigrationResult {
  success: boolean;
  migratedKeys: string[];
  failedKeys: string[];
  fromVersion: number;
  toVersion: number;
}

export type MigrationFn = (key: string, value: any) => { key: string; value: any } | null;

export class InMemoryStorageAdapter implements StorageAdapter {
  private static sharedStorage: Map<string, any> = new Map();
  private static versionRegistry: Map<string, number> = new Map();
  private static migrations: Map<string, Map<number, MigrationFn>> = new Map();

  private storage: Map<string, any>;
  private useShared: boolean;
  private namespace: string;
  private version: number;

  constructor(options: {
    useShared?: boolean;
    namespace?: string;
    version?: number;
  } = {}) {
    const { useShared = false, namespace = 'default', version = 1 } = options;
    this.useShared = useShared;
    this.namespace = namespace;
    this.version = version;
    this.storage = useShared ? InMemoryStorageAdapter.sharedStorage : new Map();

    if (useShared) {
      const existingVersion = InMemoryStorageAdapter.versionRegistry.get(namespace);
      if (existingVersion && existingVersion !== version) {
        console.warn(`Storage version mismatch: requested v${version}, but ${namespace} uses v${existingVersion}`);
      } else {
        InMemoryStorageAdapter.versionRegistry.set(namespace, version);
      }
    }
  }

  private getNamespacedKey(key: string): string {
    return `${this.namespace}:v${this.version}:${key}`;
  }

  private stripNamespace(namespacedKey: string): string {
    const prefix = `${this.namespace}:v${this.version}:`;
    if (namespacedKey.startsWith(prefix)) {
      return namespacedKey.substring(prefix.length);
    }
    return namespacedKey;
  }

  private getAllNamespaceKeys(includeOldVersions: boolean = false): string[] {
    const keys: string[] = [];
    for (const key of this.storage.keys()) {
      if (includeOldVersions) {
        if (key.startsWith(`${this.namespace}:`)) {
          keys.push(key);
        }
      } else {
        if (key.startsWith(`${this.namespace}:v${this.version}:`)) {
          keys.push(key);
        }
      }
    }
    return keys;
  }

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key);
    const value = this.storage.get(namespacedKey);
    
    if (value !== undefined) {
      return JSON.parse(JSON.stringify(value));
    }

    const oldVersions = await this.findAvailableVersions();
    for (const oldVersion of oldVersions) {
      if (oldVersion < this.version) {
        const oldKey = `${this.namespace}:v${oldVersion}:${key}`;
        const oldValue = this.storage.get(oldKey);
        if (oldValue !== undefined) {
          const migrated = await this.migrateKey(key, oldValue, oldVersion, this.version);
          if (migrated) {
            await this.set(key, migrated.value);
            return JSON.parse(JSON.stringify(migrated.value));
          }
        }
      }
    }

    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    this.storage.set(namespacedKey, JSON.parse(JSON.stringify(value)));
  }

  async remove(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    this.storage.delete(namespacedKey);
  }

  async list<T>(prefix: string): Promise<T[]> {
    const items: T[] = [];
    const namespacedPrefix = this.getNamespacedKey(prefix);
    
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(namespacedPrefix)) {
        items.push(JSON.parse(JSON.stringify(value)));
      }
    }

    if (items.length === 0) {
      const oldVersions = await this.findAvailableVersions();
      for (const oldVersion of oldVersions) {
        if (oldVersion < this.version) {
          const oldPrefix = `${this.namespace}:v${oldVersion}:${prefix}`;
          for (const [key, value] of this.storage.entries()) {
            if (key.startsWith(oldPrefix)) {
              const originalKey = key.substring(`${this.namespace}:v${oldVersion}:`.length);
              const migrated = await this.migrateKey(originalKey, value, oldVersion, this.version);
              if (migrated) {
                await this.set(originalKey, migrated.value);
                items.push(JSON.parse(JSON.stringify(migrated.value)));
              }
            }
          }
        }
      }
    }

    return items;
  }

  async clear(): Promise<void> {
    const keysToDelete = this.getAllNamespaceKeys(false);
    for (const key of keysToDelete) {
      this.storage.delete(key);
    }
  }

  async clearAllVersions(): Promise<void> {
    const keysToDelete = this.getAllNamespaceKeys(true);
    for (const key of keysToDelete) {
      this.storage.delete(key);
    }
    InMemoryStorageAdapter.versionRegistry.delete(this.namespace);
  }

  async getAllKeys(): Promise<string[]> {
    return this.getAllNamespaceKeys(false).map(key => this.stripNamespace(key));
  }

  async getAllKeysWithVersions(): Promise<Array<{ key: string; version: number }>> {
    const results: Array<{ key: string; version: number }> = [];
    const allKeys = this.getAllNamespaceKeys(true);
    
    for (const namespacedKey of allKeys) {
      const match = namespacedKey.match(/^(.+):v(\d+):(.+)$/);
      if (match) {
        results.push({
          key: match[3],
          version: parseInt(match[2], 10),
        });
      }
    }
    
    return results;
  }

  async has(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    return this.storage.has(namespacedKey);
  }

  async count(prefix?: string): Promise<number> {
    if (prefix) {
      const namespacedPrefix = this.getNamespacedKey(prefix);
      let count = 0;
      for (const key of this.storage.keys()) {
        if (key.startsWith(namespacedPrefix)) {
          count++;
        }
      }
      return count;
    }
    return this.getAllNamespaceKeys(false).length;
  }

  async exportData(options?: {
    includeOldVersions?: boolean;
    filter?: (key: string) => boolean;
  }): Promise<StorageExportData> {
    const { includeOldVersions = false, filter } = options || {};
    const data: Record<string, any> = {};
    const keys = this.getAllNamespaceKeys(includeOldVersions);

    for (const namespacedKey of keys) {
      const originalKey = this.stripNamespace(namespacedKey);
      if (!filter || filter(originalKey)) {
        const value = this.storage.get(namespacedKey);
        if (value !== undefined) {
          data[originalKey] = JSON.parse(JSON.stringify(value));
        }
      }
    }

    return {
      version: this.version,
      namespace: this.namespace,
      data,
      exportedAt: Date.now(),
      count: Object.keys(data).length,
    };
  }

  async importData(
    exportData: StorageExportData,
    options?: {
      overwrite?: boolean;
      migrateFromVersion?: number;
    }
  ): Promise<{ imported: number; skipped: number; migrated: number }> {
    const { overwrite = false, migrateFromVersion } = options || {};
    let imported = 0;
    let skipped = 0;
    let migrated = 0;

    for (const [key, value] of Object.entries(exportData.data)) {
      const exists = await this.has(key);
      
      if (exists && !overwrite) {
        skipped++;
        continue;
      }

      let finalValue = value;
      if (migrateFromVersion !== undefined && migrateFromVersion !== this.version) {
        const migratedResult = await this.migrateKey(key, value, migrateFromVersion, this.version);
        if (migratedResult) {
          finalValue = migratedResult.value;
          migrated++;
        }
      }

      await this.set(key, finalValue);
      imported++;
    }

    return { imported, skipped, migrated };
  }

  async findAvailableVersions(): Promise<number[]> {
    const versions: Set<number> = new Set();
    for (const key of this.storage.keys()) {
      const match = key.match(/^(.+):v(\d+):/);
      if (match && match[1] === this.namespace) {
        versions.add(parseInt(match[2], 10));
      }
    }
    return Array.from(versions).sort((a, b) => a - b);
  }

  async getCurrentVersion(): Promise<number> {
    return InMemoryStorageAdapter.versionRegistry.get(this.namespace) || this.version;
  }

  static registerMigration(
    namespace: string,
    fromVersion: number,
    migrationFn: MigrationFn
  ): void {
    if (!InMemoryStorageAdapter.migrations.has(namespace)) {
      InMemoryStorageAdapter.migrations.set(namespace, new Map());
    }
    InMemoryStorageAdapter.migrations.get(namespace)!.set(fromVersion, migrationFn);
  }

  private async migrateKey(
    key: string,
    value: any,
    fromVersion: number,
    toVersion: number
  ): Promise<{ key: string; value: any } | null> {
    const migrations = InMemoryStorageAdapter.migrations.get(this.namespace);
    if (!migrations) return { key, value };

    let currentKey = key;
    let currentValue = value;

    for (let v = fromVersion; v < toVersion; v++) {
      const migration = migrations.get(v);
      if (migration) {
        const result = migration(currentKey, currentValue);
        if (result === null) return null;
        currentKey = result.key;
        currentValue = result.value;
      }
    }

    return { key: currentKey, value: currentValue };
  }

  async migrateToVersion(
    targetVersion: number,
    options?: { dryRun?: boolean }
  ): Promise<MigrationResult> {
    const currentVersion = await this.getCurrentVersion();
    if (targetVersion <= currentVersion) {
      return {
        success: false,
        migratedKeys: [],
        failedKeys: [],
        fromVersion: currentVersion,
        toVersion: targetVersion,
      };
    }

    const migratedKeys: string[] = [];
    const failedKeys: string[] = [];
    const allKeys = await this.getAllKeys();

    for (const key of allKeys) {
      try {
        const value = await this.get(key);
        if (value !== null) {
          const migrated = await this.migrateKey(key, value, currentVersion, targetVersion);
          if (migrated && !options?.dryRun) {
            const newAdapter = new InMemoryStorageAdapter({
              useShared: this.useShared,
              namespace: this.namespace,
              version: targetVersion,
            });
            await newAdapter.set(migrated.key, migrated.value);
          }
          migratedKeys.push(key);
        }
      } catch {
        failedKeys.push(key);
      }
    }

    if (!options?.dryRun) {
      InMemoryStorageAdapter.versionRegistry.set(this.namespace, targetVersion);
    }

    return {
      success: failedKeys.length === 0,
      migratedKeys,
      failedKeys,
      fromVersion: currentVersion,
      toVersion: targetVersion,
    };
  }

  async getUserKeys(userId: string): Promise<string[]> {
    const keys: string[] = [];
    const currentNamespacePrefix = `${this.namespace}:v${this.version}:`;
    
    for (const key of this.storage.keys()) {
      if (!key.startsWith(currentNamespacePrefix)) continue;
      
      const strippedKey = this.stripNamespace(key);
      if (strippedKey.includes(`:${userId}`) || strippedKey.includes(`${userId}:`)) {
        keys.push(strippedKey);
      }
    }
    
    return keys;
  }

  async clearUserData(userId: string): Promise<number> {
    const userKeys = await this.getUserKeys(userId);
    for (const key of userKeys) {
      await this.remove(key);
    }
    return userKeys.length;
  }

  async copyUserData(
    fromUserId: string,
    toUserId: string,
    options?: { overwrite?: boolean }
  ): Promise<{ copied: number; skipped: number }> {
    const { overwrite = false } = options || {};
    const fromKeys = await this.getUserKeys(fromUserId);
    let copied = 0;
    let skipped = 0;

    for (const fromKey of fromKeys) {
      const toKey = fromKey.replace(`${fromUserId}:`, `${toUserId}:`);
      const exists = await this.has(toKey);
      
      if (exists && !overwrite) {
        skipped++;
        continue;
      }

      const value = await this.get(fromKey);
      if (value !== null) {
        await this.set(toKey, value);
        copied++;
      }
    }

    return { copied, skipped };
  }

  static clearShared(): void {
    InMemoryStorageAdapter.sharedStorage.clear();
    InMemoryStorageAdapter.versionRegistry.clear();
  }

  static getSharedInstance(options?: { namespace?: string; version?: number }): InMemoryStorageAdapter {
    return new InMemoryStorageAdapter({
      useShared: true,
      ...options,
    });
  }
}

export default InMemoryStorageAdapter;
