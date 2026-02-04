import { z } from 'zod';
import { getCreateTableQueryFromTable, getTableFromZodSchema } from '../../util/table';

export const TriggerConfigRecord = z.object({
  trigger_id: z.string(),
  namespace: z.string(),
  user_id: z.string().nullable(),
  org_id: z.string().nullable(),
  created_at: z.string(),
  is_active: z.union([z.literal(0), z.literal(1)]),
  github_repo: z.string(),
  mode: z.string(),
  model: z.string(),
  prompt_template: z.string(),
  // Profile reference - resolved at runtime via Hyperdrive
  profile_id: z.string(),
  // Behavior flags (not profile-related)
  auto_commit: z.union([z.literal(0), z.literal(1)]).nullable(),
  condense_on_complete: z.union([z.literal(0), z.literal(1)]).nullable(),
  webhook_auth_header: z.string().nullable(),
  webhook_auth_secret_hash: z.string().nullable(),
});

export type TriggerConfigRecord = z.infer<typeof TriggerConfigRecord>;

export const triggerConfig = getTableFromZodSchema('trigger_config', TriggerConfigRecord);

export function createTableTriggerConfig(): string {
  return getCreateTableQueryFromTable(triggerConfig, {
    trigger_id: /* sql */ `text primary key`,
    namespace: /* sql */ `text not null`,
    user_id: /* sql */ `text`,
    org_id: /* sql */ `text`,
    created_at: /* sql */ `text not null`,
    is_active: /* sql */ `integer not null`,
    github_repo: /* sql */ `text not null`,
    mode: /* sql */ `text not null`,
    model: /* sql */ `text not null`,
    prompt_template: /* sql */ `text not null`,
    // Profile reference - resolved at runtime via Hyperdrive
    profile_id: /* sql */ `text not null`,
    // Behavior flags (not profile-related)
    auto_commit: /* sql */ `integer`,
    condense_on_complete: /* sql */ `integer`,
    webhook_auth_header: /* sql */ `text`,
    webhook_auth_secret_hash: /* sql */ `text`,
  });
}
