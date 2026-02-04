# Plan: Enable Auto-Top-Up for Organizations

This plan outlines the steps to enable auto-top-up for organizations.

**Design Decision: Unified Schema**
We will refactor the existing `user_auto_top_up_configs` into a **unified table** (`auto_top_up_configs`) that supports both users and organizations, following the pattern used in `deployments`.

- **Reason**: This aligns with the established pattern in `platform_integrations`, `deployments`, and `agent_configs`, which use mutually exclusive foreign keys with a check constraint. This promotes long-term maintainability and schema consistency.
- **Implementation**: We will rename the existing table, add ownership columns (`owned_by_user_id`, `owned_by_organization_id`) and an audit column (`created_by_user_id`), and add a check constraint to ensure exactly one owner is set.

## PR 1: Database Schema & Migration (Safe)

**Goal:** Refactor storage for auto-top-up configuration with zero-downtime support.

### Schema Changes

1.  **Refactor `user_auto_top_up_configs` to `auto_top_up_configs`**:
    - Rename table to `auto_top_up_configs`.
    - Rename `kilo_user_id` to `owned_by_user_id` (FK to `kilocode_users.id`, nullable, `onDelete: 'cascade'`, `onUpdate: 'cascade'`).
    - Add `owned_by_organization_id`: UUID (FK to `organizations.id`, nullable, `onDelete: 'cascade'`, `onUpdate: 'cascade'`).
    - Add `created_by_user_id`: text (nullable, no FK) — audit trail, matching `deployments.created_by_user_id` semantics (null for user-owned configs, set for org-owned configs).
    - Add Check Constraint: `(owned_by_user_id IS NOT NULL AND owned_by_organization_id IS NULL) OR (owned_by_user_id IS NULL AND owned_by_organization_id IS NOT NULL)`.
    - Add Unique Index on `owned_by_organization_id` (where not null).
    - Update existing Unique Index on `owned_by_user_id` (where not null).

### Migration Strategy (Zero Downtime)

1.  Generate migration using Drizzle Kit.
2.  **Manually Edit Migration**: Add a compatibility view for old code:

    ```sql
    CREATE VIEW "user_auto_top_up_configs" AS SELECT
      id,
      owned_by_user_id AS kilo_user_id,
      stripe_payment_method_id,
      amount_cents,
      last_auto_top_up_at,
      attempt_started_at,
      disabled_reason,
      created_at,
      updated_at
    FROM "auto_top_up_configs"
    WHERE owned_by_user_id IS NOT NULL;
    ```

    - This ensures that old code (running during deployment) can still query/insert into `user_auto_top_up_configs` via the view.
    - The `WHERE` clause ensures only user configs are visible through the old view.

### Code Changes (in same PR)

3.  **Update all code references** from `user_auto_top_up_configs` / `kilo_user_id` to `auto_top_up_configs` / `owned_by_user_id`:
    - `src/db/schema.ts` — update table definition
    - `src/lib/autoTopUp.ts` — update queries
    - Any other files referencing the old table/column names
    - This makes the fallback view immediately unused by the new code.

## PR 1.5: Drop Fallback View (Safe, after PR 1 is deployed)

**Goal:** Clean up the compatibility view once all code uses the new table.

1.  **Create migration**: `DROP VIEW IF EXISTS "user_auto_top_up_configs";`
    - This is safe to run after PR 1 is fully deployed and no old code is running.
    - Can be done as a standalone migration or bundled with the next schema change.

## PR 2: Shared Payment Logic & Refactor (Safe)

**Goal:** Generalize the generic "Auto-Top-Up Payment" logic to accept not only users, so it can be used for organizations, too.

In `src/lib/autoTopUp.ts`\*\* (keep all changes in this single file to minimize diff): - Add `AutoTopUpEntity` type (union of user | organization) following the `CreditEntity` pattern from `promotionalCredits.ts`. - Where there are steps that clearly need very different code for user vs. org, consider extracting a helper that takes the entity as a parameter and hides that complexity from the
flow of autoTopUp; e.g. balance computation might make sense there. - when naming entity fields, follow db snake_case. - At the end of this step I expect to see something like async function performAutoTopUp(entity: AutoTopUpEntity, traceId: string): Promise<AutoTopUpResult>
with user-or-org logic working throughout.

## PR 3: Persist Organization Payment Methods (Safe)

**Goal:** Ensure payment methods used for manual organization top-ups are saved.

1.  **Update `ensurePaymentMethodStored`** in `src/lib/stripe.ts`:
    - Add `organizationId` support.
2.  **Update `handleSuccessfulChargeWithPayment`**:
    - Pass `organizationId` from metadata to `ensurePaymentMethodStored`.

## PR 4: Org Auto-Top-Up Engine (Safe - Unreachable)

**Goal:** Implement the org-specific balance check and locking, reusing the shared payment logic.

1.  **Add to `src/lib/autoTopUp.ts`**:
    - Implement `maybePerformOrganizationAutoTopUp`:
      - Check `organizations.microdollars_balance`.
      - Check config in `auto_top_up_configs` (by `owned_by_organization_id`) & acquire lock.
      - Build org entity and call the shared `executeAutoTopUpPayment()`.

## PR 5: Webhook Handling

**Goal:** Handle `invoice.paid` for orgs.

1.  **Update `processStripePaymentEventHook`**:
    - Handle `metadata.type === 'org-auto-topup'`.
    - Call `processTopupForOrganization`.
    - Release org lock.

## PR 6: The Trigger (Safe)

**Goal:** Wire up the trigger. Safe because no orgs can configure auto-top-up yet.

Following the user auto-top-up pattern (which triggers on balance observation in `getBalanceForUser`), we trigger org auto-top-up when balance is observed in `getBalanceForOrganizationUser`.

1.  **Update `getBalanceForOrganizationUser`** in `src/lib/organizations/organization-usage.ts`:
    - After computing balance, call `maybePerformOrganizationAutoTopUp` via `after()` (fire-and-forget).
    - This mirrors the user pattern in `getBalanceForUser` which calls `maybePerformAutoTopUp` via `after()`.
    - No feature flag needed — without UI, no orgs can enable auto-top-up.

## PR 7: Admin API & UI (Kilo Admins Only)

**Goal:** Configuration UI, initially restricted to kilo admins for internal testing.

1.  **Backend**: TRPC procedures for `get`/`update` config (using `owned_by_organization_id`).
    - Use the same permission model as other org payment operations (org admins/owners can configure).
    - **Gate UI visibility** behind kilo admin check (not feature flag).
2.  **Frontend**: Settings UI in Organization Billing.
    - Only visible to kilo admins initially.
    - Enables internal testing before broader rollout.

## PR 8: General Availability (Business Decision)

**Goal:** Enable for all organizations.

1.  Remove kilo admin restriction from PR 7.
2.  Coordinate with marketing for announcement timing.

## PR 9: Hardening (Safe)

1.  **Tests**: Unit tests for the new engine and shared logic.
2.  **Observability**: Sentry logging.
