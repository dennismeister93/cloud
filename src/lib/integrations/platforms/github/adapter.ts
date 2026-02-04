import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { exchangeWebFlowCode } from '@octokit/oauth-methods';
import { logExceptInTest } from '@/lib/utils.server';

import crypto from 'crypto';
import type { InstallationToken } from '@/lib/integrations/core/types';
import { type GitHubAppType, getGitHubAppCredentials } from './app-selector';

export type { GitHubAppType } from './app-selector';

/**
 * Verifies GitHub webhook signature
 * @param appType - The type of GitHub App to verify against (defaults to 'standard')
 */
export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string,
  appType: GitHubAppType = 'standard'
): boolean {
  const credentials = getGitHubAppCredentials(appType);
  const hmac = crypto.createHmac('sha256', credentials.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

/**
 * Generates GitHub App installation token
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function generateGitHubInstallationToken(
  installationId: string,
  appType: GitHubAppType = 'standard'
): Promise<InstallationToken> {
  const credentials = getGitHubAppCredentials(appType);

  if (!credentials.appId || !credentials.privateKey) {
    throw new Error(`GitHub ${appType} App credentials not configured`);
  }

  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
    installationId,
  });

  const authResult = await auth({ type: 'installation' });

  return {
    token: authResult.token,
    expires_at: authResult.expiresAt,
  };
}

/**
 * Deletes a GitHub App installation
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function deleteGitHubInstallation(
  installationId: string,
  appType: GitHubAppType = 'standard'
): Promise<void> {
  const credentials = getGitHubAppCredentials(appType);

  if (!credentials.appId || !credentials.privateKey) {
    throw new Error(`GitHub ${appType} App credentials not configured`);
  }

  // Create app-level authentication (not installation-level)
  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
  });

  const { token } = await auth({ type: 'app' });
  const octokit = new Octokit({ auth: token });

  // Delete the installation
  await octokit.apps.deleteInstallation({
    installation_id: parseInt(installationId),
  });
}

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
};

type GitHubBranch = {
  name: string;
  isDefault: boolean;
};

/**
 * Fetches all repositories accessible by a GitHub App installation
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function fetchGitHubRepositories(
  installationId: string,
  appType: GitHubAppType = 'standard'
): Promise<GitHubRepository[]> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  // Fetch all repositories accessible by the installation using pagination
  const repositories: GitHubRepository[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page,
    });

    // Filter out archived repositories
    repositories.push(
      ...data.repositories
        .filter(repo => !repo.archived)
        .map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
        }))
    );

    if (data.repositories.length < perPage) break;
    page++;
  }

  return repositories;
}

/**
 * Fetches all branches for a GitHub repository
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function fetchGitHubBranches(
  installationId: string,
  repositoryFullName: string,
  appType: GitHubAppType = 'standard'
): Promise<GitHubBranch[]> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  const [owner, repo] = repositoryFullName.split('/');

  // Fetch the repository to get the default branch
  const { data: repoData } = await octokit.repos.get({
    owner,
    repo,
  });
  const defaultBranch = repoData.default_branch;

  // Fetch all branches using pagination
  const branches: GitHubBranch[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: perPage,
      page,
    });

    branches.push(
      ...data.map(branch => ({
        name: branch.name,
        isDefault: branch.name === defaultBranch,
      }))
    );

    if (data.length < perPage) break;
    page++;
  }

  return branches;
}

/*
 * Fetches GitHub App installation details including permissions
 * Uses app-level authentication to get installation info
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function fetchGitHubInstallationDetails(
  installationId: string,
  appType: GitHubAppType = 'standard'
): Promise<{
  id: number;
  account: {
    id: number;
    login: string;
    type: string;
  };
  repository_selection: string;
  permissions: Record<string, string>;
  events: string[];
  created_at: string;
}> {
  const credentials = getGitHubAppCredentials(appType);

  if (!credentials.appId || !credentials.privateKey) {
    throw new Error(`GitHub ${appType} App credentials not configured`);
  }

  // Create app-level authentication (not installation-level)
  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
  });

  const { token } = await auth({ type: 'app' });
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.apps.getInstallation({
    installation_id: parseInt(installationId),
  });

  return {
    id: data.id,
    account: {
      id: data.account?.id ?? 0,
      login: (data.account as { login?: string })?.login ?? '',
      type: (data.account as { type?: string })?.type ?? 'User',
    },
    repository_selection: data.repository_selection ?? 'all',
    permissions: data.permissions as Record<string, string>,
    events: data.events ?? [],
    created_at: data.created_at,
  };
}

/**
 * Adds a reaction to a PR (or issue)
 * Used to show that Kilo is reviewing a PR (e.g., 👀 eyes reaction)
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function addReactionToPR(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  reaction: 'eyes' | '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket',
  appType: GitHubAppType = 'standard'
): Promise<void> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  await octokit.reactions.createForIssue({
    owner,
    repo,
    issue_number: prNumber,
    content: reaction,
  });
}

/**
 * Exchange GitHub OAuth code for user information
 * Used during installation request flow to identify the GitHub user
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function exchangeGitHubOAuthCode(
  code: string,
  appType: GitHubAppType = 'standard'
): Promise<{
  id: string;
  login: string;
}> {
  const credentials = getGitHubAppCredentials(appType);

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error(`Missing GitHub ${appType} App credentials`);
  }

  const { authentication } = await exchangeWebFlowCode({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    clientType: 'github-app',
    code,
  });

  if (!authentication.token) {
    throw new Error(`Token exchange failed`);
  }

  const accessToken = authentication.token;

  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: githubUser } = await octokit.rest.users.getAuthenticated();

  return {
    id: githubUser.id.toString(),
    login: githubUser.login,
  };
}

/**
 * Finds an existing Kilo review comment on a PR
 * Looks for the <!-- kilo-review --> marker in issue comments
 * Falls back to detecting older Kilo comments by patterns if no marker found
 * Returns the most recent comment ID and body if found, null otherwise
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function findKiloReviewComment(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  appType: GitHubAppType = 'standard'
): Promise<{ commentId: number; body: string } | null> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  // Fetch all issue comments (PR comments are issue comments in GitHub API)
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  logExceptInTest('[findKiloReviewComment] Fetched comments', {
    owner,
    repo,
    prNumber,
    totalComments: comments.length,
  });

  // Primary: Look for comments with the kilo-review marker
  const markedComments = comments.filter(c => c.body?.includes('<!-- kilo-review -->'));

  if (markedComments.length > 0) {
    // Sort by updated_at descending and pick the latest
    const latestComment = markedComments.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
    logExceptInTest('[findKiloReviewComment] Found comment with marker', {
      owner,
      repo,
      prNumber,
      commentId: latestComment.id,
      markedCommentsCount: markedComments.length,
      detectionMethod: 'marker',
    });
    return { commentId: latestComment.id, body: latestComment.body || '' };
  }

  logExceptInTest('[findKiloReviewComment] No existing Kilo review comment found', {
    owner,
    repo,
    prNumber,
    totalComments: comments.length,
  });

  return null;
}

/**
 * Fetches existing inline review comments on a PR
 * Used to detect duplicates and track outdated comments
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function fetchPRInlineComments(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  appType: GitHubAppType = 'standard'
): Promise<
  Array<{
    id: number;
    path: string;
    line: number | null;
    body: string;
    isOutdated: boolean;
    user: { login: string };
  }>
> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  const comments: Array<{
    id: number;
    path: string;
    line: number | null;
    body: string;
    isOutdated: boolean;
    user: { login: string };
  }> = [];

  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: perPage,
      page,
    });

    comments.push(
      ...data.map(c => ({
        id: c.id,
        path: c.path,
        line: c.line ?? null,
        body: c.body,
        isOutdated: c.position === null, // null position = outdated
        user: { login: c.user?.login ?? 'unknown' },
      }))
    );

    if (data.length < perPage) break;
    page++;
  }

  logExceptInTest('[fetchPRInlineComments] Fetched comments', {
    owner,
    repo,
    prNumber,
    totalComments: comments.length,
  });

  return comments;
}

/**
 * Gets the HEAD commit SHA for a PR
 * Required for creating inline comments via gh api
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function getPRHeadCommit(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  appType: GitHubAppType = 'standard'
): Promise<string> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  logExceptInTest('[getPRHeadCommit] Got HEAD commit', {
    owner,
    repo,
    prNumber,
    headSha: pr.head.sha.substring(0, 8),
  });

  return pr.head.sha;
}

/**
 * Type guard to check if an error is an HTTP error from Octokit
 */
function isHttpError(error: unknown): error is { status: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Check if user already has a fork of a repository
 * @param accountLogin - The GitHub username of the account where the fork would be created
 * @param appType - The type of GitHub App to use (defaults to 'standard')
 */
export async function checkExistingFork(
  installationId: string,
  accountLogin: string,
  sourceOwner: string,
  sourceRepo: string,
  appType: GitHubAppType = 'standard'
): Promise<{ exists: boolean; fullName: string | null }> {
  const tokenData = await generateGitHubInstallationToken(installationId, appType);
  const octokit = new Octokit({ auth: tokenData.token });

  try {
    // Check if the user has a repo with the same name as the source
    const { data: repo } = await octokit.repos.get({
      owner: accountLogin,
      repo: sourceRepo,
    });

    // Verify it's actually a fork of the source repo
    if (repo.fork && repo.parent?.full_name === `${sourceOwner}/${sourceRepo}`) {
      return {
        exists: true,
        fullName: repo.full_name,
      };
    }

    // User has a repo with the same name but it's not a fork of our source
    // This is an edge case - the fork will be created with a different name
    return { exists: false, fullName: null };
  } catch (error) {
    // 404 means the repo doesn't exist - no existing fork
    if (isHttpError(error) && error.status === 404) {
      return { exists: false, fullName: null };
    }
    throw error;
  }
}
