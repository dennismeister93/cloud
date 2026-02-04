#!/usr/bin/env npx ts-node

/**
 * Manual Integration Test for App Builder Git Operations
 *
 * Tests git clone and push operations against a locally running app builder.
 *
 * Prerequisites:
 * - App builder running at http://localhost:8790
 * - Set AUTH_TOKEN environment variable (or update below)
 *
 * Usage:
 *   cd cloudflare-app-builder
 *   AUTH_TOKEN=dev-token-change-this-in-production npx ts-node src/test-git-integration.ts
 *
 * What this tests:
 * 1. Initialize a new project
 * 2. Generate 'full' and 'ro' (read-only) tokens
 * 3. Clone repository with full token
 * 4. Push changes with full token
 * 5. Clone again to verify push worked
 * 6. Verify read-only token cannot push
 */

import { execSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// --- Configuration ---
const APP_BUILDER_URL = process.env.APP_BUILDER_URL || 'http://localhost:8790';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token-change-this-in-production';

// --- Types ---
type TokenPermission = 'full' | 'ro';

type InitSuccessResponse = {
  success: true;
  app_id: string;
  git_url: string;
};

type TokenResponse = {
  success: true;
  token: string;
  expires_at: string;
  permission: TokenPermission;
};

// --- Helper Functions ---

function log(message: string, data?: unknown) {
  console.log(`[TEST] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function logError(message: string, error?: unknown) {
  console.error(`[ERROR] ${message}`, error);
}

function logSuccess(message: string) {
  console.log(`[✓] ${message}`);
}

function logFailure(message: string) {
  console.error(`[✗] ${message}`);
}

async function initProject(projectId: string): Promise<InitSuccessResponse> {
  const endpoint = `${APP_BUILDER_URL}/apps/${encodeURIComponent(projectId)}/init`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to init project: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function generateGitToken(
  appId: string,
  permission: TokenPermission
): Promise<TokenResponse> {
  const endpoint = `${APP_BUILDER_URL}/apps/${encodeURIComponent(appId)}/token`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ permission }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to generate token: ${response.status} - ${errorText}`);
  }

  return response.json();
}

function buildGitUrlWithToken(gitUrl: string, token: string): string {
  // Replace https://hostname/path with https://x-access-token:token@hostname/path
  const url = new URL(gitUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

function runGitCommand(dir: string, command: string, expectFailure = false): string {
  const fullCommand = `cd "${dir}" && ${command}`;
  log(`Running: ${command}`);

  try {
    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expectFailure) {
      throw new Error(`Expected command to fail but it succeeded: ${command}`);
    }
    return output;
  } catch (error: unknown) {
    // execSync throws on non-zero exit
    if (expectFailure) {
      const execError = error as { stderr?: string; stdout?: string; message?: string };
      log('Command failed as expected', {
        stderr: execError.stderr?.slice(0, 500),
        stdout: execError.stdout?.slice(0, 500),
      });
      return execError.stderr || execError.message || 'Command failed';
    }
    throw error;
  }
}

// --- Main Test ---

async function runTests() {
  const testId = `test-git-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = mkdtempSync(join(tmpdir(), 'app-builder-test-'));

  log('Starting git integration test', {
    testId,
    tempDir,
    appBuilderUrl: APP_BUILDER_URL,
  });

  try {
    // ===========================================
    // Step 1: Initialize Project
    // ===========================================
    log('\n=== Step 1: Initialize Project ===');
    const initResult = await initProject(testId);
    log('Project initialized', initResult);
    logSuccess(`Project initialized: ${initResult.app_id}`);

    const gitUrl = initResult.git_url;

    // ===========================================
    // Step 2: Generate Tokens
    // ===========================================
    log('\n=== Step 2: Generate Tokens ===');

    const fullTokenResult = await generateGitToken(testId, 'full');
    log('Full token generated', {
      permission: fullTokenResult.permission,
      expiresAt: fullTokenResult.expires_at,
      tokenLength: fullTokenResult.token.length,
    });
    logSuccess('Full token generated');

    const roTokenResult = await generateGitToken(testId, 'ro');
    log('Read-only token generated', {
      permission: roTokenResult.permission,
      expiresAt: roTokenResult.expires_at,
      tokenLength: roTokenResult.token.length,
    });
    logSuccess('Read-only token generated');

    // ===========================================
    // Step 3: Clone with Full Token
    // ===========================================
    log('\n=== Step 3: Clone with Full Token ===');

    const cloneDir1 = join(tempDir, 'clone1');
    mkdirSync(cloneDir1, { recursive: true });

    const fullTokenUrl = buildGitUrlWithToken(gitUrl, fullTokenResult.token);
    runGitCommand(tempDir, `git clone "${fullTokenUrl}" clone1`);

    const files1 = readdirSync(cloneDir1);
    log('Cloned repository contents', { files: files1 });

    if (files1.length === 0) {
      throw new Error('Clone resulted in empty directory');
    }
    logSuccess(`Clone with full token succeeded, ${files1.length} files`);

    // ===========================================
    // Step 4: Make Changes and Push with Full Token
    // ===========================================
    log('\n=== Step 4: Push Changes with Full Token ===');

    const testFileName = 'test-file.txt';
    const testFileContent = `Test file created at ${new Date().toISOString()}\nTest ID: ${testId}`;
    writeFileSync(join(cloneDir1, testFileName), testFileContent);

    runGitCommand(cloneDir1, 'git config user.email "test@example.com"');
    runGitCommand(cloneDir1, 'git config user.name "Test User"');
    runGitCommand(cloneDir1, `git add "${testFileName}"`);
    runGitCommand(cloneDir1, `git commit -m "Add test file"`);
    runGitCommand(cloneDir1, 'git push origin main');

    logSuccess('Push with full token succeeded');

    // ===========================================
    // Step 5: Clone Again to Verify Push
    // ===========================================
    log('\n=== Step 5: Clone Again to Verify Push ===');

    // Generate a fresh token for the second clone
    const fullTokenResult2 = await generateGitToken(testId, 'full');
    const fullTokenUrl2 = buildGitUrlWithToken(gitUrl, fullTokenResult2.token);

    const cloneDir2 = join(tempDir, 'clone2');
    mkdirSync(cloneDir2, { recursive: true });

    runGitCommand(tempDir, `git clone "${fullTokenUrl2}" clone2`);

    const files2 = readdirSync(cloneDir2);
    log('Second clone contents', { files: files2 });

    if (!files2.includes(testFileName)) {
      throw new Error(`Test file "${testFileName}" not found in second clone`);
    }

    const clonedTestContent = readFileSync(join(cloneDir2, testFileName), 'utf-8');
    if (clonedTestContent !== testFileContent) {
      throw new Error('Test file content mismatch');
    }

    logSuccess('Second clone verified - push was persisted');

    // ===========================================
    // Step 6: Clone with Read-Only Token
    // ===========================================
    log('\n=== Step 6: Clone with Read-Only Token ===');

    // Generate fresh read-only token
    const roTokenResult2 = await generateGitToken(testId, 'ro');
    const roTokenUrl = buildGitUrlWithToken(gitUrl, roTokenResult2.token);

    const cloneDir3 = join(tempDir, 'clone3');
    mkdirSync(cloneDir3, { recursive: true });

    runGitCommand(tempDir, `git clone "${roTokenUrl}" clone3`);

    const files3 = readdirSync(cloneDir3);
    log('Read-only clone contents', { files: files3 });
    logSuccess('Clone with read-only token succeeded');

    // ===========================================
    // Step 7: Attempt Push with Read-Only Token (Should Fail)
    // ===========================================
    log('\n=== Step 7: Attempt Push with Read-Only Token (Should Fail) ===');

    const testFileName2 = 'should-not-exist.txt';
    writeFileSync(join(cloneDir3, testFileName2), 'This should not be pushed');

    runGitCommand(cloneDir3, 'git config user.email "test@example.com"');
    runGitCommand(cloneDir3, 'git config user.name "Test User"');
    runGitCommand(cloneDir3, `git add "${testFileName2}"`);
    runGitCommand(cloneDir3, `git commit -m "Should fail push"`);

    // This should fail - read-only token cannot push
    const pushError = runGitCommand(
      cloneDir3,
      'git push origin main 2>&1 || true',
      false // We handle the error ourselves with || true
    );

    // Check if push actually failed
    if (
      pushError.includes('Forbidden') ||
      pushError.includes('403') ||
      pushError.includes('denied') ||
      pushError.includes('rejected')
    ) {
      logSuccess('Push with read-only token correctly rejected');
    } else {
      // Try another verification: clone again and check if file exists
      const fullTokenResult3 = await generateGitToken(testId, 'full');
      const fullTokenUrl3 = buildGitUrlWithToken(gitUrl, fullTokenResult3.token);

      const cloneDir4 = join(tempDir, 'clone4');
      mkdirSync(cloneDir4, { recursive: true });

      runGitCommand(tempDir, `git clone "${fullTokenUrl3}" clone4`);
      const files4 = readdirSync(cloneDir4);

      if (files4.includes(testFileName2)) {
        logFailure('Read-only token was able to push! This is a security issue.');
        throw new Error('Read-only token should not be able to push');
      } else {
        logSuccess('Push with read-only token was rejected (file not in repo)');
      }
    }

    // ===========================================
    // All Tests Passed
    // ===========================================
    console.log('\n' + '='.repeat(50));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(50));
    console.log(`\nTest Summary:`);
    console.log(`  - Project ID: ${testId}`);
    console.log(`  - Git URL: ${gitUrl}`);
    console.log(`  - Full token clone: ✓`);
    console.log(`  - Full token push: ✓`);
    console.log(`  - Push persistence verified: ✓`);
    console.log(`  - Read-only token clone: ✓`);
    console.log(`  - Read-only token push blocked: ✓`);
  } catch (error) {
    logError('Test failed', error);
    console.log('\n' + '='.repeat(50));
    console.log('❌ TESTS FAILED');
    console.log('='.repeat(50));
    process.exit(1);
  } finally {
    // Cleanup
    log('\nCleaning up temp directory...');
    try {
      rmSync(tempDir, { recursive: true, force: true });
      log('Cleanup complete');
    } catch (e) {
      logError('Failed to cleanup temp directory', e);
    }
  }
}

// Run tests
runTests().catch(error => {
  logError('Unhandled error', error);
  process.exit(1);
});
