/**
 * Git Repository Agent
 * Stores git repositories in SQLite and provides export functionality
 * Uses RPC for communication with workers
 */

import { DurableObject } from 'cloudflare:workers';
import git from '@ashishkumar472/cf-git';
import { SqliteFS } from './git/fs-adapter';
import { logger, withLogTags, formatError } from './utils/logger';
import type { Env, GitObject, RepositoryStats } from './types';

export class GitRepositoryDO extends DurableObject<Env> {
  /**
   * Tagged template SQL helper for safe parameterized queries.
   * Copied from cloudflare-db-proxy/src/app-db-do.ts
   */
  private sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): T[] {
    let sql = strings[0];
    const params: unknown[] = [];

    for (let i = 0; i < values.length; i++) {
      sql += `?${strings[i + 1]}`;
      params.push(values[i]);
    }

    const cursor = this.ctx.storage.sql.exec(sql, ...params);
    return cursor.toArray() as T[];
  }

  private fs: SqliteFS | null = null;
  private _initialized = false;

  /**
   * Initialize the git filesystem (internal method)
   */
  private async initializeFS(): Promise<void> {
    if (this.fs) return;

    logger.debug('Initializing SqliteFS', { id: this.ctx.id.toString() });

    // Use our sql() tagged template helper for safe SQL parameterization
    this.fs = new SqliteFS(this.sql.bind(this));
    this.fs.init();

    // Check if .git directory exists
    try {
      await this.fs.stat('.git');
      this._initialized = true;
      logger.debug('Repository already initialized');
    } catch (_err) {
      // .git doesn't exist, repo not initialized yet
      this._initialized = false;
      logger.debug('Repository not yet initialized');
    }
  }

  /**
   * Check if the repository is initialized (RPC method)
   */
  async isInitialized(): Promise<boolean> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      await this.initializeFS();
      return this._initialized;
    });
  }

  /**
   * Initialize a new git repository (RPC method)
   */
  async initialize(): Promise<void> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      if (!this.fs) {
        await this.initializeFS();
      }

      if (this._initialized) {
        logger.debug('Repository already initialized');
        return;
      }

      logger.debug('Initializing new git repository');

      if (!this.fs) {
        throw new Error('Filesystem not initialized');
      }

      await git.init({ fs: this.fs, dir: '/', defaultBranch: 'main' });
      this._initialized = true;

      logger.debug('Git repository initialized successfully');
    });
  }

  /**
   * Create initial commit with the provided files (RPC method)
   * Files are expected to have base64-encoded content to safely handle binary data through RPC
   */
  async createInitialCommit(files: Record<string, string>): Promise<void> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      await this.initialize();

      if (!this.fs) {
        throw new Error('Filesystem not initialized');
      }

      logger.debug('Creating initial commit', { fileCount: Object.keys(files).length });

      // Write files (decode base64 to binary)
      for (const [path, base64Content] of Object.entries(files)) {
        // Decode base64 to binary
        const bytes = Buffer.from(base64Content, 'base64');

        await this.fs.writeFile(path, bytes);
        await git.add({ fs: this.fs, dir: '/', filepath: path });
      }

      // Commit
      await git.commit({
        fs: this.fs,
        dir: '/',
        message: 'Initial commit',
        author: {
          name: 'Kilo Code Cloud',
          email: 'agent@kilocode.ai',
        },
      });

      logger.debug('Initial commit created');
    });
  }

  /**
   * Export git objects for cloning (RPC method)
   * Returns objects with base64-encoded data for serialization
   */
  async exportGitObjects(): Promise<GitObject[]> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      if (!this.fs) {
        await this.initializeFS();
      }

      if (!this._initialized || !this.fs) {
        return [];
      }

      const objects = this.fs.exportGitObjects();

      // Convert Uint8Array to base64 for JSON serialization
      return objects.map(obj => ({
        path: obj.path,
        data: Buffer.from(obj.data).toString('base64'),
      }));
    });
  }

  /**
   * Import git objects from a push operation (RPC method)
   * Writes all objects to the filesystem, replacing existing ones
   */
  async importGitObjects(objects: GitObject[]): Promise<void> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      if (!this.fs) {
        await this.initializeFS();
      }

      if (!this.fs) {
        throw new Error('Filesystem not initialized');
      }

      // Ensure repo is initialized
      if (!this._initialized) {
        await this.initialize();
      }

      logger.debug('Importing git objects', { count: objects.length });

      for (const obj of objects) {
        // Convert base64 back to binary
        const bytes = Buffer.from(obj.data, 'base64');

        // Write to filesystem
        await this.fs.writeFile(obj.path, bytes);
      }

      logger.debug('Git objects imported successfully');
    });
  }

  /**
   * Get the latest commit hash on the main branch (RPC method)
   */
  async getLatestCommit(): Promise<string | null> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      if (!this.fs) {
        await this.initializeFS();
      }

      if (!this._initialized || !this.fs) {
        return null;
      }

      try {
        const commitHash = await git.resolveRef({ fs: this.fs, dir: '/', ref: 'HEAD' });
        return commitHash;
      } catch (err) {
        logger.error('Failed to get latest commit', formatError(err));
        return null;
      }
    });
  }

  /**
   * Get storage statistics (RPC method)
   */
  async getStats(): Promise<RepositoryStats> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      if (!this.fs) {
        await this.initializeFS();
      }

      if (!this.fs) {
        return { totalObjects: 0, totalBytes: 0, largestObject: null, initialized: false };
      }

      const stats = this.fs.getStorageStats();
      return { ...stats, initialized: this._initialized };
    });
  }

  // Legacy auth token verification (for transition period, read-only)
  // Only used to support existing repositories with stored tokens
  // New repositories should use JWT authentication instead
  async verifyAuthToken(token: string): Promise<boolean> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      const storedToken = await this.ctx.storage.get<string>('auth_token');

      if (!storedToken || storedToken.trim().length === 0) {
        return false;
      }

      return storedToken === token;
    });
  }

  /**
   * Delete all repository data (RPC method)
   * Called when deleting a project to clean up storage
   */
  async deleteAll(): Promise<void> {
    return withLogTags({ source: 'GitRepositoryDO' }, async () => {
      logger.info('Deleting all repository data');

      // deleteAll() clears all storage including SQLite tables
      await this.ctx.storage.deleteAll();

      this._initialized = false;
      this.fs = null;

      logger.info('Repository deleted successfully');
    });
  }
}
