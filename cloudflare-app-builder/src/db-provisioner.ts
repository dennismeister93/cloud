import type { Sandbox } from '@cloudflare/sandbox';
import type { Env, DbCredentials } from './types';
import { logger } from './utils/logger';

export const DBProvisionResult = {
  NO_DB: 'NO_DB',
  PROVISIONED: 'PROVISIONED',
  MIGRATED: 'MIGRATED',
} as const;

export type DBProvisionResult = (typeof DBProvisionResult)[keyof typeof DBProvisionResult];

type DBProvisionerDeps = {
  env: Pick<Env, 'DB_PROXY' | 'DB_PROXY_URL'>;
  getCredentials: () => DbCredentials | null;
  setCredentials: (creds: DbCredentials) => Promise<void>;
};

export function createDBProvisioner(deps: DBProvisionerDeps) {
  async function needsDB(sandbox: Sandbox): Promise<boolean> {
    const result = await sandbox.readFile('/workspace/package.json');
    if (!result.success) return false;
    try {
      const pkg = JSON.parse(result.content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      return '@kilocode/app-builder-db' in allDeps;
    } catch {
      return false;
    }
  }

  async function provisionDB(appId: string): Promise<void> {
    logger.info('Provisioning database');
    const { token } = await deps.env.DB_PROXY.provision(appId);
    const url = deps.env.DB_PROXY_URL + '/api/' + appId + '/query';
    await deps.setCredentials({ url, token });
    logger.info('Database provisioned');
  }

  async function runMigrations(sandbox: Sandbox): Promise<void> {
    logger.debug('Running migrations');
    const dbCreds = deps.getCredentials();
    if (!dbCreds) {
      logger.warn('Missing db credentials');
      return;
    }

    const result = await sandbox.exec('cd /workspace && bun run db:migrate', {
      env: { DB_URL: dbCreds.url, DB_TOKEN: dbCreds.token },
    });

    if (!result.success) {
      throw new Error(`Migration failed: ${result.stderr || 'Unknown error'}`);
    }
    logger.debug('Migrations completed');
  }

  async function provisionIfNeeded(sandbox: Sandbox, appId: string): Promise<DBProvisionResult> {
    if (!(await needsDB(sandbox))) {
      return DBProvisionResult.NO_DB;
    }

    const needsProvisioning = !deps.getCredentials();
    if (needsProvisioning) {
      await provisionDB(appId);
    }

    await runMigrations(sandbox);
    return needsProvisioning ? DBProvisionResult.PROVISIONED : DBProvisionResult.MIGRATED;
  }

  return { provisionIfNeeded };
}

export type DBProvisioner = ReturnType<typeof createDBProvisioner>;
