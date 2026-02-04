export enum KiloPassTier {
  Tier19 = 'tier_19',
  Tier49 = 'tier_49',
  Tier199 = 'tier_199',
}

export enum KiloPassCadence {
  Monthly = 'monthly',
  Yearly = 'yearly',
}

export enum KiloPassIssuanceSource {
  StripeInvoice = 'stripe_invoice',
  Cron = 'cron',
}

export enum KiloPassIssuanceItemKind {
  Base = 'base',
  Bonus = 'bonus',
  PromoFirstMonth50Pct = 'promo_first_month_50pct',
}

export enum KiloPassAuditLogAction {
  StripeWebhookReceived = 'stripe_webhook_received',
  KiloPassInvoicePaidHandled = 'kilo_pass_invoice_paid_handled',
  BaseCreditsIssued = 'base_credits_issued',
  BonusCreditsIssued = 'bonus_credits_issued',
  BonusCreditsSkippedIdempotent = 'bonus_credits_skipped_idempotent',
  FirstMonth50PctPromoIssued = 'first_month_50pct_promo_issued',
  YearlyMonthlyBaseCronStarted = 'yearly_monthly_base_cron_started',
  YearlyMonthlyBaseCronCompleted = 'yearly_monthly_base_cron_completed',
  IssueYearlyRemainingCredits = 'issue_yearly_remaining_credits',

  /* Not removed because I didn't want to deal with the migration. */
  /**
   * @deprecated
   */
  YearlyMonthlyBonusCronStarted = 'yearly_monthly_bonus_cron_started',
  /**
   * @deprecated
   */
  YearlyMonthlyBonusCronCompleted = 'yearly_monthly_bonus_cron_completed',
}

export enum KiloPassAuditLogResult {
  Success = 'success',
  SkippedIdempotent = 'skipped_idempotent',
  Failed = 'failed',
}

/** Matches Stripe.SubscriptionSchedule.Status */
export enum KiloPassScheduledChangeStatus {
  NotStarted = 'not_started',
  Active = 'active',
  Completed = 'completed',
  Released = 'released',
  Canceled = 'canceled',
}
