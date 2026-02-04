/**
 * GitLab API Adapter
 *
 * Provides OAuth-based authentication and API operations for GitLab.
 * Supports both GitLab.com and self-hosted GitLab instances.
 */

import { APP_URL } from '@/lib/constants';
import { getEnvVariable } from '@/lib/dotenvx';
import type { PlatformRepository } from '@/lib/integrations/core/types';
import { logExceptInTest } from '@/lib/utils.server';

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID;
const GITLAB_CLIENT_SECRET = getEnvVariable('GITLAB_CLIENT_SECRET');
const GITLAB_REDIRECT_URI = `${APP_URL}/api/integrations/gitlab/callback`;

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

/**
 * GitLab OAuth scopes required for the integration
 */
export const GITLAB_OAUTH_SCOPES = [
  'api', // Full API access (needed for MR comments, reactions)
  'read_user', // Read user info
  'read_repository', // Read repository contents
  'write_repository', // Push branches (for auto-fix)
] as const;

/**
 * GitLab API response types
 */
export type GitLabUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string;
  web_url: string;
};

export type GitLabProject = {
  id: number;
  name: string;
  path_with_namespace: string;
  visibility: 'private' | 'internal' | 'public';
  default_branch: string;
  web_url: string;
  archived: boolean;
};

export type GitLabBranch = {
  name: string;
  default: boolean;
  protected: boolean;
};

export type GitLabOAuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  created_at: number;
  scope: string;
};

/**
 * OAuth credentials type for self-hosted GitLab instances
 */
export type GitLabOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * Builds the GitLab OAuth authorization URL
 *
 * @param state - State parameter for CSRF protection (e.g., "org_xxx" or "user_xxx")
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 * @param customCredentials - Optional custom OAuth credentials for self-hosted instances
 */
export function buildGitLabOAuthUrl(
  state: string,
  instanceUrl: string = DEFAULT_GITLAB_URL,
  customCredentials?: GitLabOAuthCredentials
): string {
  const clientId = customCredentials?.clientId || GITLAB_CLIENT_ID;

  if (!clientId || !GITLAB_REDIRECT_URI) {
    throw new Error('GitLab OAuth credentials not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GITLAB_REDIRECT_URI,
    response_type: 'code',
    state,
    scope: GITLAB_OAUTH_SCOPES.join(' '),
  });

  return `${instanceUrl}/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an OAuth authorization code for access and refresh tokens
 *
 * @param code - The authorization code from the OAuth callback
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 * @param customCredentials - Optional custom OAuth credentials for self-hosted instances
 */
export async function exchangeGitLabOAuthCode(
  code: string,
  instanceUrl: string = DEFAULT_GITLAB_URL,
  customCredentials?: GitLabOAuthCredentials
): Promise<GitLabOAuthTokens> {
  const clientId = customCredentials?.clientId || GITLAB_CLIENT_ID;
  const clientSecret = customCredentials?.clientSecret || GITLAB_CLIENT_SECRET;

  if (!clientId || !clientSecret || !GITLAB_REDIRECT_URI) {
    throw new Error('GitLab OAuth credentials not configured');
  }

  const response = await fetch(`${instanceUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GITLAB_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logExceptInTest('GitLab OAuth token exchange failed:', { status: response.status, error });
    throw new Error(`GitLab OAuth token exchange failed: ${response.status}`);
  }

  const tokens = (await response.json()) as GitLabOAuthTokens;

  logExceptInTest('GitLab OAuth tokens received', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });

  return tokens;
}

/**
 * Refreshes an expired OAuth access token using the refresh token
 *
 * @param refreshToken - The refresh token
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 * @param customCredentials - Optional custom OAuth credentials for self-hosted instances
 */
export async function refreshGitLabOAuthToken(
  refreshToken: string,
  instanceUrl: string = DEFAULT_GITLAB_URL,
  customCredentials?: GitLabOAuthCredentials
): Promise<GitLabOAuthTokens> {
  const clientId = customCredentials?.clientId || GITLAB_CLIENT_ID;
  const clientSecret = customCredentials?.clientSecret || GITLAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitLab OAuth credentials not configured');
  }

  const response = await fetch(`${instanceUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logExceptInTest('GitLab OAuth token refresh failed:', { status: response.status, error });
    throw new Error(`GitLab OAuth token refresh failed: ${response.status}`);
  }

  const tokens = (await response.json()) as GitLabOAuthTokens;

  logExceptInTest('GitLab OAuth tokens refreshed', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });

  return tokens;
}

/**
 * Fetches the authenticated GitLab user's information
 *
 * @param accessToken - OAuth access token
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 */
export async function fetchGitLabUser(
  accessToken: string,
  instanceUrl: string = DEFAULT_GITLAB_URL
): Promise<GitLabUser> {
  const response = await fetch(`${instanceUrl}/api/v4/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logExceptInTest('GitLab user fetch failed:', { status: response.status, error });
    throw new Error(`GitLab user fetch failed: ${response.status}`);
  }

  return (await response.json()) as GitLabUser;
}

/**
 * Fetches all projects (repositories) accessible by the authenticated user
 *
 * @param accessToken - OAuth access token
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 */
export async function fetchGitLabProjects(
  accessToken: string,
  instanceUrl: string = DEFAULT_GITLAB_URL
): Promise<PlatformRepository[]> {
  const projects: PlatformRepository[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${instanceUrl}/api/v4/projects?membership=true&per_page=${perPage}&page=${page}&archived=false`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logExceptInTest('GitLab projects fetch failed:', { status: response.status, error });
      throw new Error(`GitLab projects fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as GitLabProject[];

    projects.push(
      ...data.map(project => ({
        id: project.id,
        name: project.name,
        full_name: project.path_with_namespace,
        private: project.visibility === 'private',
      }))
    );

    // Check if there are more pages
    const totalPages = parseInt(response.headers.get('x-total-pages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  logExceptInTest('GitLab projects fetched', { count: projects.length });

  return projects;
}

/**
 * Fetches all branches for a GitLab project
 *
 * @param accessToken - OAuth access token
 * @param projectId - GitLab project ID or path (URL-encoded)
 * @param instanceUrl - GitLab instance URL (defaults to gitlab.com)
 */
export async function fetchGitLabBranches(
  accessToken: string,
  projectId: string | number,
  instanceUrl: string = DEFAULT_GITLAB_URL
): Promise<GitLabBranch[]> {
  const encodedProjectId =
    typeof projectId === 'string' ? encodeURIComponent(projectId) : projectId;
  const branches: GitLabBranch[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${instanceUrl}/api/v4/projects/${encodedProjectId}/repository/branches?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logExceptInTest('GitLab branches fetch failed:', { status: response.status, error });
      throw new Error(`GitLab branches fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as GitLabBranch[];
    branches.push(...data);

    // Check if there are more pages
    const totalPages = parseInt(response.headers.get('x-total-pages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  logExceptInTest('GitLab branches fetched', { projectId, count: branches.length });

  return branches;
}

/**
 * Calculates the expiration timestamp from GitLab OAuth response
 *
 * @param createdAt - Unix timestamp when token was created
 * @param expiresIn - Seconds until expiration
 */
export function calculateTokenExpiry(createdAt: number, expiresIn: number): string {
  const expiresAtMs = (createdAt + expiresIn) * 1000;
  return new Date(expiresAtMs).toISOString();
}

/**
 * Checks if a token is expired or about to expire (within 5 minutes)
 *
 * @param expiresAt - ISO timestamp of token expiration
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

  return now >= expiryTime - bufferMs;
}
