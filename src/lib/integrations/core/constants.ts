/**
 * Core constants for platform integrations
 * Use these enums instead of magic strings for type safety and maintainability
 */

/**
 * Integration status values for tracking the lifecycle of platform integrations
 */
export const INTEGRATION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;

/**
 * Pending approval status values for tracking the GitHub installation approval process
 */
export const PENDING_APPROVAL_STATUS = {
  AWAITING_INSTALLATION: 'awaiting_installation',
} as const;

/**
 * GitHub webhook event types
 * These are the event names sent in the X-GitHub-Event header
 */
export const GITHUB_EVENT = {
  // Installation events
  INSTALLATION: 'installation',
  INSTALLATION_REPOSITORIES: 'installation_repositories',
  INSTALLATION_TARGET: 'installation_target',

  // Repository events
  REPOSITORY: 'repository',

  // Issue events
  ISSUES: 'issues',

  // Pull request events
  PULL_REQUEST: 'pull_request',
  PULL_REQUEST_REVIEW: 'pull_request_review',
  PULL_REQUEST_REVIEW_COMMENT: 'pull_request_review_comment',
  PULL_REQUEST_REVIEW_THREAD: 'pull_request_review_thread',

  // Push and commit events
  PUSH: 'push',
  CREATE: 'create',
  DELETE: 'delete',

  // Deployment events
  DEPLOYMENT: 'deployment',
  DEPLOYMENT_STATUS: 'deployment_status',
} as const;

/**
 * GitHub webhook action types
 * These are the action values within webhook payloads
 */
export const GITHUB_ACTION = {
  // Installation actions
  CREATED: 'created',
  DELETED: 'deleted',
  SUSPEND: 'suspend',
  UNSUSPEND: 'unsuspend',

  // Repository actions
  ADDED: 'added',
  REMOVED: 'removed',

  // Pull request actions
  OPENED: 'opened',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  SYNCHRONIZE: 'synchronize',
  EDITED: 'edited',
  ASSIGNED: 'assigned',
  UNASSIGNED: 'unassigned',
  LABELED: 'labeled',
  UNLABELED: 'unlabeled',
  READY_FOR_REVIEW: 'ready_for_review',
  CONVERTED_TO_DRAFT: 'converted_to_draft',

  // Review actions
  SUBMITTED: 'submitted',
  DISMISSED: 'dismissed',

  // Workflow actions
  REQUESTED: 'requested',
  COMPLETED: 'completed',
  IN_PROGRESS: 'in_progress',
  QUEUED: 'queued',
} as const;

/**
 * Platform types
 */
export const PLATFORM = {
  GITHUB: 'github',
  GITLAB: 'gitlab',
  SLACK: 'slack',
} as const;

/**
 * GitHub repository selection types
 */
export const REPOSITORY_SELECTION = {
  ALL: 'all',
  SELECTED: 'selected',
} as const;

// Type exports for use throughout the codebase
export type IntegrationStatus = (typeof INTEGRATION_STATUS)[keyof typeof INTEGRATION_STATUS];
export type PendingApprovalStatus =
  (typeof PENDING_APPROVAL_STATUS)[keyof typeof PENDING_APPROVAL_STATUS];
export type GitHubEvent = (typeof GITHUB_EVENT)[keyof typeof GITHUB_EVENT];
export type GitHubAction = (typeof GITHUB_ACTION)[keyof typeof GITHUB_ACTION];
export type Platform = (typeof PLATFORM)[keyof typeof PLATFORM];
export type RepositorySelection = (typeof REPOSITORY_SELECTION)[keyof typeof REPOSITORY_SELECTION];
