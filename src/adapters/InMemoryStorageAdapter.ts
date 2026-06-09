import { 
  StorageAdapter, 
  ConflictResolutionStrategy,
} from '../types';

export interface StorageExportData {
  version: number;
  namespace: string;
  data: Record<string, any>;
  exportedAt: number;
  count: number;
  sinceTimestamp?: number;
  timestamps?: Record<string, number>;
  isIncremental?: boolean;
}

export interface ImportOptions {
  overwrite?: boolean;
  migrateFromVersion?: number;
  conflictResolution?: ConflictResolutionStrategy;
  dryRun?: boolean;
  userId?: string;
}

export interface RollbackSnapshot {
  token: string;
  timestamp: number;
  namespace: string;
  version: number;
  data: Record<string, { value: any; timestamp: number }>;
  userId?: string;
}

export interface StorageIncrementalExportOptions {
  sinceTimestamp?: number;
  includeOldVersions?: boolean;
  filter?: (key: string) => boolean;
  userId?: string;
  recordTypes?: Array<'meal' | 'water' | 'weight' | 'profile' | 'favorite' | 'combination'>;
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
  private static sharedTimestamps: Map<string, number> = new Map();
  private static versionRegistry: Map<string, number> = new Map();
  private static migrations: Map<string, Map<number, MigrationFn>> = new Map();
  private static rollbackSnapshots: Map<string, RollbackSnapshot> = new Map();

  private storage: Map<string, any>;
  private timestamps: Map<string, number>;
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
    this.timestamps = useShared ? InMemoryStorageAdapter.sharedTimestamps : new Map();

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
    this.timestamps.set(namespacedKey, Date.now());
  }

  async remove(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    this.storage.delete(namespacedKey);
    this.timestamps.delete(namespacedKey);
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

  async exportData(options?: StorageIncrementalExportOptions): Promise<StorageExportData> {
    const { includeOldVersions = false, filter, sinceTimestamp, userId, recordTypes } = options || {};
    const data: Record<string, any> = {};
    const timestamps: Record<string, number> = {};
    const keys = this.getAllNamespaceKeys(includeOldVersions);

    for (const namespacedKey of keys) {
      const originalKey = this.stripNamespace(namespacedKey);
      
      if (userId && !originalKey.includes(`:${userId}`) && !originalKey.includes(`${userId}:`)) {
        continue;
      }
      
      if (recordTypes && recordTypes.length > 0) {
        const keyType = originalKey.split(':')[0];
        if (!recordTypes.includes(keyType as any)) {
          continue;
        }
      }
      
      if (sinceTimestamp) {
        const ts = this.timestamps.get(namespacedKey) || 0;
        if (ts < sinceTimestamp) {
          continue;
        }
      }
      
      if (filter && !filter(originalKey)) {
        continue;
      }
      
      const value = this.storage.get(namespacedKey);
      if (value !== undefined) {
        data[originalKey] = JSON.parse(JSON.stringify(value));
        const ts = this.timestamps.get(namespacedKey);
        if (ts !== undefined) {
          timestamps[originalKey] = ts;
        }
      }
    }

    return {
      version: this.version,
      namespace: this.namespace,
      data,
      exportedAt: Date.now(),
      count: Object.keys(data).length,
      sinceTimestamp,
      timestamps,
      isIncremental: sinceTimestamp !== undefined,
    };
  }

  async importData(
    exportData: StorageExportData,
    options?: ImportOptions
  ): Promise<{ 
    imported: number; 
    skipped: number; 
    migrated: number;
    conflicts: Array<{ key: string; strategy: string; mergedValue?: any }>;
    rollbackToken?: string;
  }> {
    const { 
      overwrite = false, 
      migrateFromVersion,
      conflictResolution = 'last_write_wins',
      dryRun = false,
      userId,
    } = options || {};
    
    let imported = 0;
    let skipped = 0;
    let migrated = 0;
    const conflicts: Array<{ key: string; strategy: string; mergedValue?: any }> = [];
    const snapshotData: Record<string, { value: any; timestamp: number }> = {};

    for (const [key, value] of Object.entries(exportData.data)) {
      if (userId && !key.includes(`:${userId}`) && !key.includes(`${userId}:`)) {
        continue;
      }
      
      const namespacedKey = this.getNamespacedKey(key);
      const exists = await this.has(key);
      const existingValue = exists ? await this.get<any>(key) : null;
      const existingTimestamp = existingValue ? (this.timestamps.get(namespacedKey) || 0) : 0;
      const importTimestamp = exportData.timestamps?.[key] || exportData.exportedAt;

      if (exists && !overwrite) {
        const mergedResult = this.resolveConflict(
          key,
          existingValue,
          value,
          existingTimestamp,
          importTimestamp,
          conflictResolution
        );

        if (mergedResult.action === 'skip') {
          skipped++;
          conflicts.push({ key, strategy: conflictResolution });
          continue;
        }

        if (mergedResult.action === 'merge') {
          conflicts.push({ key, strategy: conflictResolution, mergedValue: mergedResult.value });
        }
      }

      let finalValue = exists && !overwrite 
        ? (this.resolveConflict(
            key, existingValue, value, existingTimestamp, importTimestamp, conflictResolution
          ).value || value)
        : value;
      
      if (migrateFromVersion !== undefined && migrateFromVersion !== this.version) {
        const migratedResult = await this.migrateKey(key, finalValue, migrateFromVersion, this.version);
        if (migratedResult) {
          finalValue = migratedResult.value;
          migrated++;
        }
      }

      if (!dryRun) {
        if (existingValue !== null) {
          snapshotData[key] = {
            value: existingValue,
            timestamp: existingTimestamp || Date.now(),
          };
        }
        await this.set(key, finalValue);
      }
      imported++;
    }

    let rollbackToken: string | undefined;
    if (!dryRun && Object.keys(snapshotData).length > 0) {
      rollbackToken = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const snapshot: RollbackSnapshot = {
        token: rollbackToken,
        timestamp: Date.now(),
        namespace: this.namespace,
        version: this.version,
        data: snapshotData,
        userId,
      };
      InMemoryStorageAdapter.rollbackSnapshots.set(rollbackToken, snapshot);
    }

    return { imported, skipped, migrated, conflicts, rollbackToken };
  }

  private resolveConflict(
    key: string,
    existingValue: any,
    newValue: any,
    existingTimestamp: number,
    newTimestamp: number,
    strategy: ConflictResolutionStrategy
  ): { action: 'keep' | 'replace' | 'merge' | 'skip'; value?: any } {
    switch (strategy) {
      case 'last_write_wins':
        return newTimestamp >= existingTimestamp 
          ? { action: 'replace', value: newValue }
          : { action: 'keep', value: existingValue };
      
      case 'first_write_wins':
        return existingTimestamp >= newTimestamp
          ? { action: 'keep', value: existingValue }
          : { action: 'replace', value: newValue };
      
      case 'merge_by_timestamp':
        if (existingValue && newValue && typeof existingValue === 'object' && typeof newValue === 'object') {
          const merged = { ...existingValue, ...newValue };
          if (existingTimestamp > newTimestamp) {
            Object.assign(merged, existingValue);
          }
          return { action: 'merge', value: merged };
        }
        return { action: 'keep', value: existingValue };
      
      case 'keep_higher_quantity':
        if (existingValue?.quantity !== undefined && newValue?.quantity !== undefined) {
          return existingValue.quantity >= newValue.quantity
            ? { action: 'keep', value: existingValue }
            : { action: 'replace', value: newValue };
        }
        return { action: 'keep', value: existingValue };
      
      case 'keep_more_recent_nutrition':
        if (existingValue?.totalNutrition && newValue?.totalNutrition) {
          return newTimestamp >= existingTimestamp
            ? { action: 'replace', value: newValue }
            : { action: 'keep', value: existingValue };
        }
        return { action: 'keep', value: existingValue };
      
      case 'manual':
      default:
        return { action: 'skip' };
    }
  }

  async createRollbackSnapshot(userId?: string): Promise<string> {
    const snapshotData: Record<string, { value: any; timestamp: number }> = {};
    const keys = this.getAllNamespaceKeys(false);

    for (const namespacedKey of keys) {
      const originalKey = this.stripNamespace(namespacedKey);
      if (userId && !originalKey.includes(`:${userId}`) && !originalKey.includes(`${userId}:`)) {
        continue;
      }
      
      const value = this.storage.get(namespacedKey);
      if (value !== undefined) {
        snapshotData[originalKey] = {
          value: JSON.parse(JSON.stringify(value)),
          timestamp: this.timestamps.get(namespacedKey) || Date.now(),
        };
      }
    }

    const token = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const snapshot: RollbackSnapshot = {
      token,
      timestamp: Date.now(),
      namespace: this.namespace,
      version: this.version,
      data: snapshotData,
      userId,
    };
    InMemoryStorageAdapter.rollbackSnapshots.set(token, snapshot);
    
    return token;
  }

  async rollback(token: string): Promise<{ 
    success: boolean; 
    restoredCount: number;
    message: string;
  }> {
    const snapshot = InMemoryStorageAdapter.rollbackSnapshots.get(token);
    if (!snapshot) {
      return { success: false, restoredCount: 0, message: '回滚快照不存在或已过期' };
    }

    if (snapshot.namespace !== this.namespace || snapshot.version !== this.version) {
      return { 
        success: false, 
        restoredCount: 0, 
        message: '快照命名空间或版本不匹配' 
      };
    }

    let restoredCount = 0;
    for (const [key, entry] of Object.entries(snapshot.data)) {
      await this.set(key, entry.value);
      const namespacedKey = this.getNamespacedKey(key);
      this.timestamps.set(namespacedKey, entry.timestamp);
      restoredCount++;
    }

    return {
      success: true,
      restoredCount,
      message: `成功回滚 ${restoredCount} 条记录`,
    };
  }

  async rollbackUserData(userId: string, toTimestamp?: number): Promise<{
    success: boolean;
    restoredCount: number;
    deletedCount: number;
    message: string;
  }> {
    const userKeys = await this.getUserKeys(userId);
    let restoredCount = 0;
    let deletedCount = 0;

    for (const originalKey of userKeys) {
      const namespacedKey = this.getNamespacedKey(originalKey);
      const ts = this.timestamps.get(namespacedKey) || Date.now();

      if (toTimestamp !== undefined && ts > toTimestamp) {
        await this.remove(originalKey);
        deletedCount++;
      }
    }

    return {
      success: true,
      restoredCount,
      deletedCount,
      message: toTimestamp !== undefined
        ? `已清除 ${deletedCount} 条 ${new Date(toTimestamp).toLocaleDateString()} 之后的用户数据`
        : `回滚操作完成`,
    };
  }

  async listRollbackSnapshots(userId?: string): Promise<RollbackSnapshot[]> {
    const snapshots: RollbackSnapshot[] = [];
    for (const snapshot of InMemoryStorageAdapter.rollbackSnapshots.values()) {
      if (snapshot.namespace === this.namespace && snapshot.version === this.version) {
        if (!userId || snapshot.userId === userId) {
          snapshots.push(snapshot);
        }
      }
    }
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
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
