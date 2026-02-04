# Auto-Top-Up Implementation

## Overview

This document describes the implementation of the auto-top-up feature for Kilo Code users. The feature automatically tops up a user's balance when it drops below a configurable threshold (default $5), using a pre-approved Stripe payment method. Users can choose from $20, $50 (default), or $100 top up amounts.

**Key design decision:** Legacy users (in the Orb billing system) continue using Orb's auto-top-up. Non-legacy users use a new Stripe-based implementation.

## Architecture

Auto-top-up runs in two modes:

- **Legacy users** (in the Orb billing system): handled by Orb’s auto-top-up integration.
- **Non-legacy users**: handled by Stripe off-session payments.

The core implementation is deliberately simple:

1. The trigger creates a Stripe `Invoice` (with metadata `type: 'auto-topup'`) and pays it off-session when the balance is below the threshold.
2. Credits are applied **only** by the `invoice.paid` Stripe webhook.

### Where to look in code

- Trigger + locking: `src/lib/autoTopUp.ts` (see `maybePerformAutoTopUp()` and `performAutoTopUp()`).
- Webhook crediting + lock release: `src/lib/stripe.ts` (see the `invoice.paid` case in `processStripePaymentEventHook()`).
- Actual credit application + idempotency: `src/lib/credits.ts` (see `processTopUp()`).
- DB schema: `src/db/schema.ts` (see `auto_top_up_configs`).

### Key invariants (non-legacy)

- **Webhook is source of truth**: the trigger never updates balances.
- **Concurrency protection**: `auto_top_up_configs.attempt_started_at` is an atomic lock.
  - The lock is acquired before creating/paying the invoice.
  - On Stripe success, the lock is intentionally held until the webhook has processed the charge.
  - The lock can be treated as stale after 2 hours to avoid permanent deadlocks.

## Stripe Concepts

### `setup_future_usage: 'off_session'`

Used in the initial checkout session to tell Stripe to save the payment method for future merchant-initiated charges without customer interaction.

### Off-session payments

Used when paying invoices without customer interaction.

See the implementation in `src/lib/autoTopUp.ts` (the `client.invoices.pay(...)` call inside `performAutoTopUp()`).

### Handling 3D Secure / Authentication

Some cards require authentication. When `paymentIntent.status === 'requires_action'`:

- The charge cannot complete off-session
- Auto-top-up is disabled for the user
- User must re-enable and set up a new payment method

## Error Handling

Non-legacy auto-top-up failures are surfaced via `kilocode_users.auto_top_up_enabled = false` and a
`auto_top_up_configs.disabled_reason` string.

Implementation details live in code (see `disableAutoTopUp()` in `src/lib/autoTopUp.ts`).

## Payment Method Management

When `detachAllPaymentMethods()` is called (e.g., user removes payment method):

- `auto_top_up_enabled` is set to `false`
- The `auto_top_up_configs` row is deleted

This prevents attempts to charge a detached payment method.

## Testing

### Stripe Test Cards

- `4242424242424242` - Succeeds
- `4000002500003155` - Requires 3D Secure authentication
- `4000000000000002` - Declined

### Key Test Scenarios

- Non-legacy user enables auto-top-up → redirected to Stripe Checkout
- Balance falls below threshold → trigger creates and pays an invoice off-session
- `invoice.paid` webhook credits balance and releases the attempt lock
  - Concurrent balance checks should result in a single charge (lock enforced)
  - Cards requiring authentication should disable auto-top-up

## Configuration

Key constants live in `src/lib/autoTopUpConstants.ts`:

- `AUTO_TOP_UP_THRESHOLD_DOLLARS` (default: 5) - Balance threshold that triggers auto-top-up
- `DEFAULT_AUTO_TOP_UP_AMOUNT_CENTS` (default: 5000) - Default top up amount ($50)

The UI should reference these values from code rather than duplicating literals.
