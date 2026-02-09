import 'server-only';
import { baseProcedure, createTRPCRouter } from '@/lib/trpc/init';
import { generateApiToken } from '@/lib/tokens';
import * as appBuilderService from '@/lib/app-builder/app-builder-service';
import {
  createProjectBaseSchema,
  projectIdBaseSchema,
  sendMessageBaseSchema,
  getImageUploadUrlSchema,
  prepareLegacySessionBaseSchema,
  migrateToGitHubSchema,
} from '@/routers/app-builder/schemas';
import { getBalanceForUser } from '@/lib/user.balance';
import { MIN_BALANCE_FOR_APP_BUILDER } from '@/lib/app-builder/constants';
import { generateImageUploadUrl } from '@/lib/r2/cloud-agent-attachments';

export const appBuilderRouter = createTRPCRouter({
  /**
   * Create a new project without starting streaming
   * Returns projectId for the client to navigate to before streaming
   */
  createProject: baseProcedure.input(createProjectBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    const authToken = generateApiToken(ctx.user);

    return appBuilderService.createProject({
      owner,
      prompt: input.prompt,
      model: input.model,
      title: input.title,
      createdByUserId: ctx.user.id,
      authToken,
      images: input.images,
      template: input.template,
      mode: input.mode,
    });
  }),

  /**
   * Get preview URL for a project
   */
  getPreviewUrl: baseProcedure.input(projectIdBaseSchema).query(async ({ ctx, input }) => {
    return appBuilderService.getPreviewUrl(input.projectId, { type: 'user', id: ctx.user.id });
  }),

  /**
   * Triggers a build for the specified project
   */
  triggerBuild: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    return appBuilderService.triggerProjectBuild(input.projectId, {
      type: 'user',
      id: ctx.user.id,
    });
  }),

  /**
   * Get a single project with all messages and session state
   */
  getProject: baseProcedure.input(projectIdBaseSchema).query(async ({ ctx, input }) => {
    const authToken = generateApiToken(ctx.user);
    return appBuilderService.getProject(
      input.projectId,
      { type: 'user', id: ctx.user.id },
      authToken
    );
  }),

  /**
   * List all projects for the current user (personal context only)
   */
  listProjects: baseProcedure.query(async ({ ctx }) => {
    return appBuilderService.listProjects({ type: 'user', id: ctx.user.id });
  }),

  /**
   * Deploy an App Builder project to production
   */
  deployProject: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    return appBuilderService.deployProject(input.projectId, owner, ctx.user.id);
  }),

  /**
   * Check user's access level for App Builder.
   *
   * Returns:
   * - accessLevel: 'full' | 'limited' | 'blocked'
   *   - 'full': User has enough balance ($1+) to use all models
   *   - 'limited': User can use free models only (balance below $1)
   *   - 'blocked': Reserved for future use (e.g., if we need to block users entirely)
   *
   * Currently returns only 'full' or 'limited' - UI supports 'blocked' for easy future switch.
   */
  checkEligibility: baseProcedure.query(async ({ ctx }) => {
    const { balance } = await getBalanceForUser(ctx.user);

    // Determine access level based on balance
    // Currently only 'full' or 'limited' - change to 'blocked' if we need to restrict entirely
    const accessLevel: 'full' | 'limited' | 'blocked' =
      balance >= MIN_BALANCE_FOR_APP_BUILDER ? 'full' : 'limited';

    return {
      balance,
      minBalance: MIN_BALANCE_FOR_APP_BUILDER,
      accessLevel,
      // Keep isEligible for backwards compatibility (true if full access)
      isEligible: accessLevel === 'full',
    };
  }),

  /**
   * Generate a read-only clone token for a project
   * Returns the token, git URL, and expiration time
   */
  generateCloneToken: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    return appBuilderService.generateCloneToken(input.projectId, owner);
  }),

  /**
   * Delete a project and all associated resources
   */
  deleteProject: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    await appBuilderService.deleteProject(input.projectId, { type: 'user', id: ctx.user.id });
    return { success: true };
  }),

  /**
   * Interrupt a running App Builder session
   * Stops any ongoing Claude agent execution for the project
   */
  interruptSession: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    const authToken = generateApiToken(ctx.user);
    const result = await appBuilderService.interruptSession(input.projectId, owner, authToken);
    return { success: result.success };
  }),

  /**
   * Generate a presigned URL for uploading an image attachment
   */
  getImageUploadUrl: baseProcedure
    .input(getImageUploadUrlSchema)
    .mutation(async ({ ctx, input }) => {
      return generateImageUploadUrl({
        service: 'app-builder',
        userId: ctx.user.id,
        messageUuid: input.messageUuid,
        imageId: input.imageId,
        contentType: input.contentType,
        contentLength: input.contentLength,
      });
    }),

  // ============================================================================
  // WebSocket-based streaming mutations
  // ============================================================================

  /**
   * Start a Cloud Agent session for an existing project using WebSocket API.
   * Returns immediately with session info - client connects to WebSocket separately for events.
   *
   * This is a mutation (not subscription) - it triggers the action and returns immediately.
   * The client should then:
   * 1. Fetch a stream ticket from /api/cloud-agent/sessions/stream-ticket
   * 2. Connect to the WebSocket URL with the ticket
   */
  startSession: baseProcedure.input(projectIdBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    const authToken = generateApiToken(ctx.user);

    const result = await appBuilderService.startSessionForProject({
      projectId: input.projectId,
      owner,
      authToken,
    });

    return { cloudAgentSessionId: result.cloudAgentSessionId };
  }),

  /**
   * Send a message to an existing App Builder session using WebSocket API.
   * Returns immediately with session info - client connects to WebSocket separately for events.
   *
   * This is a mutation (not subscription) - it triggers the action and returns immediately.
   * The client should then:
   * 1. Fetch a stream ticket from /api/cloud-agent/sessions/stream-ticket
   * 2. Connect to the WebSocket URL with the ticket
   */
  sendMessage: baseProcedure.input(sendMessageBaseSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    const authToken = generateApiToken(ctx.user);

    const result = await appBuilderService.sendMessage({
      projectId: input.projectId,
      owner,
      message: input.message,
      authToken,
      images: input.images,
      model: input.model,
    });

    return { cloudAgentSessionId: result.cloudAgentSessionId };
  }),

  /**
   * Prepare a legacy session and initiate it for WebSocket-based streaming.
   *
   * Legacy sessions (created before the prepare flow) don't have session state stored
   * in the Durable Object, which means WebSocket replay doesn't work. This endpoint:
   * 1. Backfills the DO with session metadata
   * 2. Initiates the session to execute the first message
   *
   * Returns the cloudAgentSessionId for WebSocket connection.
   * The client should connect to the WebSocket to receive the response.
   */
  prepareLegacySession: baseProcedure
    .input(prepareLegacySessionBaseSchema)
    .mutation(async ({ ctx, input }) => {
      const owner = { type: 'user' as const, id: ctx.user.id };
      const authToken = generateApiToken(ctx.user);

      const result = await appBuilderService.prepareLegacySession(
        input.projectId,
        owner,
        authToken,
        input.model,
        input.prompt
      );

      return { cloudAgentSessionId: result.cloudAgentSessionId };
    }),

  // ============================================================================
  // GitHub Migration
  // ============================================================================

  /**
   * Pre-flight check for GitHub migration.
   *
   * User-created repository approach:
   * Returns info needed to guide the user through creating their own repo and granting access.
   *
   * Returns:
   * - hasGitHubIntegration: Whether the user has an active GitHub App installation
   * - targetAccountName: The GitHub account name where the repo should be created
   * - alreadyMigrated: Whether this project has already been migrated
   * - suggestedRepoName: A sanitized repo name based on project title
   * - newRepoUrl: URL to create new repo on GitHub (opens GitHub's new repo page)
   * - installationSettingsUrl: URL to manage GitHub App repo access
   * - availableRepos: List of repos accessible to the GitHub App installation
   */
  canMigrateToGitHub: baseProcedure.input(projectIdBaseSchema).query(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };
    return appBuilderService.canMigrateToGitHub(input.projectId, owner);
  }),

  /**
   * Migrate an App Builder project to GitHub.
   *
   * User-created repository approach:
   * User creates an empty repo on GitHub, grants access, then selects it here.
   * Kilo validates the repo is empty and pushes the project code.
   *
   * This is a one-way migration that:
   * 1. Validates the target repo exists, is accessible, and is empty
   * 2. Pushes the internal git repository to GitHub
   * 3. Updates the deployment to point to GitHub (if exists)
   * 4. Updates the project record with migration info
   * 5. Deletes the internal repository
   *
   * Returns success with the new GitHub repo URL, or an error code:
   * - github_app_not_installed: No GitHub App installation found
   * - already_migrated: Project has already been migrated
   * - repo_not_found: Specified repo doesn't exist or not accessible
   * - repo_not_empty: Repo has commits, must be empty
   * - push_failed: Failed to push to GitHub
   * - internal_error: Unexpected error
   */
  migrateToGitHub: baseProcedure.input(migrateToGitHubSchema).mutation(async ({ ctx, input }) => {
    const owner = { type: 'user' as const, id: ctx.user.id };

    return appBuilderService.migrateProjectToGitHub({
      projectId: input.projectId,
      owner,
      userId: ctx.user.id,
      repoFullName: input.repoFullName,
    });
  }),
});
