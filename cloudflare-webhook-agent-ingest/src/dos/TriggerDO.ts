import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { logger } from '../util/logger';
import {
  MAX_INFLIGHT_REQUESTS,
  MAX_PAYLOAD_SIZE,
  MAX_REQUESTS,
  clampRequestLimit,
} from '../util/constants';
import {
  requests,
  createTableRequests,
  getIndexesRequests,
  RequestRecord,
  type RequestUpdates,
  type ProcessStatus,
} from '../db/tables/requests.table';
import {
  createTableTriggerConfig,
  TriggerConfigRecord,
  triggerConfig,
} from '../db/tables/trigger-config.table';
import { enqueueWebhookDelivery, type WebhookDeliveryMessage } from '../util/queue';
import {
  compareWebhookSecret,
  hashWebhookSecret,
  normalizeAuthHeader,
  sanitizeWebhookAuth,
  type StoredWebhookAuth,
  type WebhookAuthInput,
} from '../util/webhook-auth';

export const TriggerConfig = z.object({
  triggerId: z.string(),
  namespace: z.string(),
  userId: z.string().nullable(),
  orgId: z.string().nullable(),
  createdAt: z.string(),
  isActive: z.boolean(),
  githubRepo: z.string(),
  mode: z.string(),
  model: z.string(),
  promptTemplate: z.string(),
  // Profile reference - resolved at runtime via Hyperdrive
  profileId: z.string(),
  // Behavior flags (not profile-related)
  autoCommit: z.boolean().optional(),
  condenseOnComplete: z.boolean().optional(),
  webhookAuthHeader: z.string().optional(),
  webhookAuthSecretHash: z.string().optional(),
});

export type TriggerConfig = z.infer<typeof TriggerConfig>;

// Response type for GET endpoint - same as TriggerConfig for profile-reference model
export type TriggerConfigResponse = Omit<TriggerConfig, 'webhookAuthSecretHash'> & {
  webhookAuthConfigured: boolean;
};

export type CapturedRequest = {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  queryString: string | null;
  headers: Record<string, string>;
  body: string;
  contentType: string | null;
  sourceIp: string | null;
  startedAt: string | null;
  completedAt: string | null;
  processStatus: ProcessStatus;
  cloudAgentSessionId: string | null;
  errorMessage: string | null;
};

type CountOccurrences<
  String_ extends string,
  SubString extends string,
  Count extends unknown[] = [],
> = String_ extends `${string}${SubString}${infer Tail}`
  ? CountOccurrences<Tail, SubString, [unknown, ...Count]>
  : Count['length'];

type Tuple<T, N extends number, Acc extends T[] = []> = Acc['length'] extends N
  ? Acc
  : Tuple<T, N, [...Acc, T]>;

type SqliteParams<Query extends string> = Tuple<unknown, CountOccurrences<Query, '?'>>;

type ConfigureInput = {
  githubRepo: string;
  mode: string;
  model: string;
  promptTemplate: string;
  profileId: string;
  autoCommit?: boolean;
  condenseOnComplete?: boolean;
  webhookAuth?: WebhookAuthInput;
};

type WebhookAuthUpdateInput = {
  header?: string | null;
  secret?: string | null;
};

type UpdateConfigInput = {
  mode?: string;
  model?: string;
  promptTemplate?: string;
  isActive?: boolean;
  profileId?: string;
  autoCommit?: boolean | null;
  condenseOnComplete?: boolean | null;
  webhookAuth?: WebhookAuthUpdateInput;
};

export class TriggerDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private dbInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    void ctx.blockConcurrencyWhile(async () => {
      await this.ensureDatabaseInitialized();
    });
  }

  private query<Query extends string>(query: Query, params: SqliteParams<Query>) {
    // Cast required: SqliteParams<Query> is a tuple of exact length matching placeholders,
    // but sql.exec() accepts variadic unknown[]. TypeScript cannot verify tuple-to-spread safety.
    return this.sql.exec(query, ...(params as unknown[]));
  }

  private async initializeDatabase(): Promise<void> {
    this.query(createTableRequests(), []);
    this.query(createTableTriggerConfig(), []);

    for (const idx of getIndexesRequests()) {
      this.query(idx, []);
    }

    this.tryAddTriggerConfigColumn(triggerConfig.columns.webhook_auth_header, 'text');
    this.tryAddTriggerConfigColumn(triggerConfig.columns.webhook_auth_secret_hash, 'text');

    logger.debug('TriggerDO database initialized');
    this.dbInitialized = true;
  }

  private tryAddTriggerConfigColumn(column: string, definition: string): void {
    try {
      this.query(`ALTER TABLE ${triggerConfig.toString()} ADD COLUMN ${column} ${definition}`, []);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column name')) {
        return;
      }
      throw error;
    }
  }

  private async ensureDatabaseInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeDatabase();
    }
    await this.initPromise;
  }

  async configure(
    namespace: string,
    triggerId: string,
    configOverrides?: ConfigureInput
  ): Promise<{ success: boolean }> {
    await this.ensureDatabaseInitialized();
    const { userId, orgId } = parseNamespace(namespace);

    if (!configOverrides) {
      throw new Error('Trigger configuration is required');
    }

    const webhookAuth = await this.resolveWebhookAuthOnCreate(configOverrides.webhookAuth);

    const config: TriggerConfig = {
      triggerId,
      namespace,
      userId,
      orgId,
      createdAt: new Date().toISOString(),
      isActive: true,
      githubRepo: configOverrides.githubRepo,
      mode: configOverrides.mode,
      model: configOverrides.model,
      promptTemplate: configOverrides.promptTemplate,
      profileId: configOverrides.profileId,
      autoCommit: configOverrides.autoCommit,
      condenseOnComplete: configOverrides.condenseOnComplete,
      webhookAuthHeader: webhookAuth?.header,
      webhookAuthSecretHash: webhookAuth?.secretHash,
    };

    await this.ctx.storage.put('config', config);

    this.query(
      /* sql */ `
        INSERT OR REPLACE INTO ${triggerConfig.toString()} (
          ${triggerConfig.columns.trigger_id},
          ${triggerConfig.columns.namespace},
          ${triggerConfig.columns.user_id},
          ${triggerConfig.columns.org_id},
          ${triggerConfig.columns.created_at},
          ${triggerConfig.columns.is_active},
          ${triggerConfig.columns.github_repo},
          ${triggerConfig.columns.mode},
          ${triggerConfig.columns.model},
          ${triggerConfig.columns.prompt_template},
          ${triggerConfig.columns.profile_id},
          ${triggerConfig.columns.auto_commit},
          ${triggerConfig.columns.condense_on_complete},
          ${triggerConfig.columns.webhook_auth_header},
          ${triggerConfig.columns.webhook_auth_secret_hash}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        config.triggerId,
        config.namespace,
        config.userId,
        config.orgId,
        config.createdAt,
        config.isActive ? 1 : 0,
        config.githubRepo,
        config.mode,
        config.model,
        config.promptTemplate,
        config.profileId,
        config.autoCommit !== undefined ? (config.autoCommit ? 1 : 0) : null,
        config.condenseOnComplete !== undefined ? (config.condenseOnComplete ? 1 : 0) : null,
        webhookAuth?.header ?? null,
        webhookAuth?.secretHash ?? null,
      ]
    );

    logger.info('Trigger configured', {
      triggerId,
      namespace,
      userId,
      orgId,
      profileId: config.profileId,
    });

    return { success: true };
  }

  async isActive(): Promise<boolean> {
    const config = await this.getConfig();
    return config?.isActive ?? false;
  }

  async getConfig(): Promise<TriggerConfig | null> {
    await this.ensureDatabaseInitialized();
    const row = this.query(
      /* sql */ `
        SELECT * FROM ${triggerConfig.toString()}
        LIMIT 1
      `,
      []
    ).toArray();

    if (row.length === 0) {
      return null;
    }

    const record = TriggerConfigRecord.parse(row[0]);
    return {
      triggerId: record.trigger_id,
      namespace: record.namespace,
      userId: record.user_id,
      orgId: record.org_id,
      createdAt: record.created_at,
      isActive: record.is_active === 1,
      githubRepo: record.github_repo,
      mode: record.mode,
      model: record.model,
      promptTemplate: record.prompt_template,
      profileId: record.profile_id,
      autoCommit: record.auto_commit !== null ? record.auto_commit === 1 : undefined,
      condenseOnComplete:
        record.condense_on_complete !== null ? record.condense_on_complete === 1 : undefined,
      webhookAuthHeader: record.webhook_auth_header ?? undefined,
      webhookAuthSecretHash: record.webhook_auth_secret_hash ?? undefined,
    };
  }

  /**
   * Get config for API response.
   * With profile-reference model, this is the same as getConfig().
   */
  async getConfigForResponse(): Promise<TriggerConfigResponse | null> {
    const config = await this.getConfig();
    return this.sanitizeConfigForResponse(config);
  }

  /**
   * Update trigger config with partial updates
   * Note: githubRepo and triggerId cannot be changed after creation
   *
   * For optional fields (autoCommit, condenseOnComplete):
   * - undefined = leave unchanged
   * - null = explicitly clear the field
   * - value = set to new value
   */
  async updateConfig(updates: UpdateConfigInput): Promise<{ success: boolean }> {
    await this.ensureDatabaseInitialized();
    const existingConfig = await this.getConfig();
    if (!existingConfig) {
      return { success: false };
    }

    // Helper to handle null-clears: null → undefined, undefined → keep existing
    const resolveNullable = <T>(
      update: T | null | undefined,
      existing: T | undefined
    ): T | undefined => {
      if (update === null) return undefined; // explicit clear
      if (update === undefined) return existing; // keep existing
      return update; // new value
    };

    const webhookAuth = await this.resolveWebhookAuthOnUpdate(existingConfig, updates.webhookAuth);

    // Merge updates with existing config
    const updatedConfig: TriggerConfig = {
      ...existingConfig,
      mode: updates.mode ?? existingConfig.mode,
      model: updates.model ?? existingConfig.model,
      promptTemplate: updates.promptTemplate ?? existingConfig.promptTemplate,
      isActive: updates.isActive ?? existingConfig.isActive,
      profileId: updates.profileId ?? existingConfig.profileId,
      autoCommit: resolveNullable(updates.autoCommit, existingConfig.autoCommit),
      condenseOnComplete: resolveNullable(
        updates.condenseOnComplete,
        existingConfig.condenseOnComplete
      ),
      webhookAuthHeader: webhookAuth?.header,
      webhookAuthSecretHash: webhookAuth?.secretHash,
    };

    await this.ctx.storage.put('config', updatedConfig);

    this.query(
      /* sql */ `
        UPDATE ${triggerConfig.toString()} SET
          ${triggerConfig.columns.mode} = ?,
          ${triggerConfig.columns.model} = ?,
          ${triggerConfig.columns.prompt_template} = ?,
          ${triggerConfig.columns.is_active} = ?,
          ${triggerConfig.columns.profile_id} = ?,
          ${triggerConfig.columns.auto_commit} = ?,
          ${triggerConfig.columns.condense_on_complete} = ?,
          ${triggerConfig.columns.webhook_auth_header} = ?,
          ${triggerConfig.columns.webhook_auth_secret_hash} = ?
        WHERE ${triggerConfig.columns.trigger_id} = ?
      `,
      [
        updatedConfig.mode,
        updatedConfig.model,
        updatedConfig.promptTemplate,
        updatedConfig.isActive ? 1 : 0,
        updatedConfig.profileId,
        updatedConfig.autoCommit !== undefined ? (updatedConfig.autoCommit ? 1 : 0) : null,
        updatedConfig.condenseOnComplete !== undefined
          ? updatedConfig.condenseOnComplete
            ? 1
            : 0
          : null,
        webhookAuth?.header ?? null,
        webhookAuth?.secretHash ?? null,
        updatedConfig.triggerId,
      ]
    );

    logger.info('Trigger config updated', {
      triggerId: updatedConfig.triggerId,
      namespace: updatedConfig.namespace,
      profileId: updatedConfig.profileId,
    });

    return { success: true };
  }

  async getAuthConfig(): Promise<StoredWebhookAuth | null> {
    await this.ensureDatabaseInitialized();
    const config = await this.getConfig();
    return extractStoredWebhookAuth(config);
  }

  private async resolveWebhookAuthOnCreate(
    input?: WebhookAuthInput
  ): Promise<StoredWebhookAuth | null> {
    if (!input) {
      return null;
    }

    const header = normalizeAuthHeader(input.header);
    const secret = input.secret?.trim();

    if (!header) {
      throw new Error('Webhook auth header cannot be empty');
    }

    if (!secret) {
      throw new Error('Webhook auth secret cannot be empty');
    }

    const secretHash = await hashWebhookSecret(secret);
    return { header, secretHash };
  }

  private async resolveWebhookAuthOnUpdate(
    existing: TriggerConfig,
    input?: WebhookAuthUpdateInput
  ): Promise<StoredWebhookAuth | null> {
    const current = extractStoredWebhookAuth(existing);

    if (!input) {
      return current;
    }

    if (input.header === null || input.secret === null) {
      return null;
    }

    let header = current?.header ?? null;
    if (input.header !== undefined) {
      const normalized = normalizeAuthHeader(input.header);
      if (!normalized) {
        throw new Error('Webhook auth header cannot be empty');
      }
      header = normalized;
    }

    let secretHash = current?.secretHash ?? null;
    if (input.secret !== undefined) {
      const trimmedSecret = input.secret?.trim();
      if (!trimmedSecret) {
        throw new Error('Webhook auth secret cannot be empty');
      }
      secretHash = await hashWebhookSecret(trimmedSecret);
    }

    if (!header && !secretHash) {
      return null;
    }

    if (!header || !secretHash) {
      throw new Error('Webhook auth requires both header and secret');
    }

    return { header, secretHash };
  }

  private sanitizeConfigForResponse(config: TriggerConfig | null): TriggerConfigResponse | null {
    if (!config) {
      return null;
    }

    const { webhookAuthSecretHash: _webhookAuthSecretHash, ...rest } = config;
    const webhookAuth = sanitizeWebhookAuth(extractStoredWebhookAuth(config));

    return {
      ...rest,
      webhookAuthHeader: webhookAuth.webhookAuthHeader,
      webhookAuthConfigured: webhookAuth.webhookAuthConfigured,
    };
  }

  async captureRequest(request: {
    method: string;
    path: string;
    queryString: string | null;
    headers: Record<string, string>;
    body: string;
    contentType: string | null;
    sourceIp: string | null;
  }): Promise<{ success: true; requestId: string } | { success: false; error: string }> {
    await this.ensureDatabaseInitialized();
    const config = await this.getConfig();
    if (!config?.isActive) {
      return { success: false, error: 'Trigger not configured or inactive' };
    }

    const storedWebhookAuth = extractStoredWebhookAuth(config);
    if (storedWebhookAuth) {
      const candidateSecret =
        request.headers[storedWebhookAuth.header] ??
        request.headers[storedWebhookAuth.header.toLowerCase()];
      if (!candidateSecret) {
        logger.warn('Webhook auth header missing', {
          triggerId: config.triggerId,
          namespace: config.namespace,
        });
        return { success: false, error: 'Unauthorized' };
      }

      const isMatch = await compareWebhookSecret(storedWebhookAuth.secretHash, candidateSecret);
      if (!isMatch) {
        logger.warn('Webhook auth secret mismatch', {
          triggerId: config.triggerId,
          namespace: config.namespace,
        });
        return { success: false, error: 'Unauthorized' };
      }
    }

    const inflightRow = this.query(
      /* sql */ `
        SELECT COUNT(*) as count
        FROM ${requests.toString()}
        WHERE ${requests.columns.process_status} IN ('captured', 'inprogress')
      `,
      []
    ).toArray();
    const inflightCount = inflightRow[0]?.count ? Number(inflightRow[0].count) : 0;
    if (inflightCount >= MAX_INFLIGHT_REQUESTS) {
      return { success: false, error: 'Too many in-flight requests' };
    }

    if (request.body.length > MAX_PAYLOAD_SIZE) {
      return { success: false, error: 'Payload too large' };
    }

    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    this.query(
      /* sql */ `
        INSERT INTO ${requests.toString()} (
          ${requests.columns.id},
          ${requests.columns.timestamp},
          ${requests.columns.method},
          ${requests.columns.path},
          ${requests.columns.query_string},
          ${requests.columns.headers},
          ${requests.columns.body},
          ${requests.columns.content_type},
          ${requests.columns.source_ip},
          ${requests.columns.process_status}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'captured')
      `,
      [
        requestId,
        timestamp,
        request.method,
        request.path,
        request.queryString,
        JSON.stringify(request.headers),
        request.body,
        request.contentType,
        request.sourceIp,
      ]
    );

    this.query(
      /* sql */ `
        DELETE FROM ${requests.toString()}
        WHERE ${requests.columns.id} IN (
          SELECT ${requests.columns.id} FROM ${requests.toString()}
          WHERE ${requests.columns.process_status} NOT IN ('inprogress')
          ORDER BY ${requests.columns.created_at} DESC
          LIMIT -1 OFFSET ?
        )
      `,
      [MAX_REQUESTS]
    );

    const message: WebhookDeliveryMessage = {
      namespace: config.namespace,
      triggerId: config.triggerId,
      requestId,
    };

    try {
      await enqueueWebhookDelivery(this.env.WEBHOOK_DELIVERY_QUEUE, message);
    } catch (enqueueError) {
      // If queue enqueue fails, mark the request as failed to prevent orphaned captured requests
      // with no processing path. The inbound call will return an error.
      logger.error('Failed to enqueue webhook delivery, marking request as failed', {
        requestId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      });

      this.query(
        /* sql */ `
          UPDATE ${requests.toString()}
          SET ${requests.columns.process_status} = 'failed',
              ${requests.columns.completed_at} = ?,
              ${requests.columns.error_message} = ?
          WHERE ${requests.columns.id} = ?
        `,
        [
          new Date().toISOString(),
          `Queue enqueue failed: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`,
          requestId,
        ]
      );

      return { success: false, error: 'Failed to queue request for processing' };
    }

    logger.info('Request captured', {
      requestId,
      method: request.method,
      path: request.path,
      contentType: request.contentType,
    });

    return { success: true, requestId };
  }

  async listRequests(limit: number = 50): Promise<{ requests: CapturedRequest[] }> {
    await this.ensureDatabaseInitialized();
    const clampedLimit = clampRequestLimit(limit);
    const rows = this.query(
      /* sql */ `
        SELECT * FROM ${requests.toString()}
        ORDER BY ${requests.columns.timestamp} DESC
        LIMIT ?
      `,
      [clampedLimit]
    ).toArray();

    const capturedRequests = rows.map(row => recordToCapturedRequest(RequestRecord.parse(row)));

    return { requests: capturedRequests };
  }

  async getRequest(requestId: string): Promise<CapturedRequest | null> {
    await this.ensureDatabaseInitialized();
    const rows = this.query(
      /* sql */ `
        SELECT * FROM ${requests.toString()}
        WHERE ${requests.columns.id} = ?
      `,
      [requestId]
    ).toArray();

    if (rows.length === 0) {
      return null;
    }

    const record = RequestRecord.parse(rows[0]);
    return recordToCapturedRequest(record);
  }

  async updateRequest(requestId: string, updates: RequestUpdates): Promise<{ success: boolean }> {
    await this.ensureDatabaseInitialized();
    const setClauses: string[] = [];
    const values: Array<RequestUpdates[keyof RequestUpdates]> = [];

    if (updates.process_status !== undefined) {
      setClauses.push(`${requests.columns.process_status} = ?`);
      values.push(updates.process_status);
    }
    if (updates.cloud_agent_session_id !== undefined) {
      setClauses.push(`${requests.columns.cloud_agent_session_id} = ?`);
      values.push(updates.cloud_agent_session_id);
    }
    if (updates.started_at !== undefined) {
      setClauses.push(`${requests.columns.started_at} = ?`);
      values.push(updates.started_at);
    }
    if (updates.completed_at !== undefined) {
      setClauses.push(`${requests.columns.completed_at} = ?`);
      values.push(updates.completed_at);
    }
    if (updates.error_message !== undefined) {
      setClauses.push(`${requests.columns.error_message} = ?`);
      values.push(updates.error_message);
    }

    if (setClauses.length === 0) {
      return { success: true };
    }

    this.sql.exec(
      `UPDATE ${requests.toString()} SET ${setClauses.join(', ')} WHERE ${requests.columns.id} = ?`,
      ...values,
      requestId
    );

    logger.info('Request updated', {
      requestId,
      updates,
    });

    return { success: true };
  }

  async deleteTrigger(): Promise<{ success: boolean }> {
    this.query(
      /* sql */ `
        DELETE FROM ${triggerConfig.toString()}
      `,
      []
    );
    this.query(
      /* sql */ `
        DELETE FROM ${requests.toString()}
      `,
      []
    );

    await this.ctx.storage.deleteAll();
    this.dbInitialized = false;
    this.initPromise = null;

    logger.info('Trigger deleted');

    return { success: true };
  }
}

function parseNamespace(namespace: string): { userId: string | null; orgId: string | null } {
  if (namespace.startsWith('user/')) {
    return {
      userId: namespace.slice(5),
      orgId: null,
    };
  }
  if (namespace.startsWith('org/')) {
    return {
      userId: null,
      orgId: namespace.slice(4),
    };
  }
  return {
    userId: namespace,
    orgId: null,
  };
}

function extractStoredWebhookAuth(config: TriggerConfig | null): StoredWebhookAuth | null {
  if (!config?.webhookAuthHeader || !config.webhookAuthSecretHash) {
    return null;
  }
  return {
    header: config.webhookAuthHeader,
    secretHash: config.webhookAuthSecretHash,
  };
}

function recordToCapturedRequest(record: RequestRecord): CapturedRequest {
  const headers = parseRequestHeaders(record.headers);
  return {
    id: record.id,
    timestamp: record.timestamp,
    method: record.method,
    path: record.path,
    queryString: record.query_string,
    headers,
    body: record.body,
    contentType: record.content_type,
    sourceIp: record.source_ip,
    startedAt: record.started_at,
    completedAt: record.completed_at,
    processStatus: record.process_status,
    cloudAgentSessionId: record.cloud_agent_session_id,
    errorMessage: record.error_message,
  };
}

function parseRequestHeaders(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const headers: Record<string, string> = {};
      for (const [key, headerValue] of Object.entries(parsed)) {
        if (typeof headerValue === 'string') {
          headers[key] = headerValue;
        }
      }
      return headers;
    }
  } catch {
    return {};
  }
  return {};
}
