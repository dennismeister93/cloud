jest.mock('@/lib/config.server', () => ({
  GITHUB_ADMIN_STATS_TOKEN: 'test-token',
}));

jest.mock('@/lib/fetchWithBackoff', () => ({
  fetchWithBackoff: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    fetch(input, init),
}));

import {
  getKilocodeRepoOpenPullRequestsSummary,
  getKilocodeRepoRecentlyClosedExternalPRs,
  parseGithubListPullRequestsSummaryResponse,
} from '@/lib/github/open-pull-request-counts';

function mockGithubJsonResponse(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getKilocodeRepoOpenPullRequestsSummary bot author classification', () => {
  it('treats PRs authored by user.type === Bot as team PRs and excludes them from external list', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 1,
        title: 'bot pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/1',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'renovate', type: 'Bot' },
      },
      {
        number: 2,
        title: 'external pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/2',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 1,
        review_comments: 2,
        user: { login: 'some-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (
          urlString.includes('/repos/Kilo-Org/kilocode/pulls') &&
          init?.method !== undefined &&
          init.method !== 'GET'
        ) {
          throw new Error('Unexpected non-GET request');
        }

        // List pulls endpoint includes query params (e.g. /pulls?state=open...)
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        // Org membership check for "some-user" should classify as external.
        if (urlString.includes('/orgs/Kilo-Org/members/')) {
          return new Response('', { status: 404 });
        }

        // Comment endpoints should be hit only for the external PR (number 2).
        if (urlString.includes('/issues/2/comments') || urlString.includes('/pulls/2/comments')) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/pulls/2/reviews')) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/issues/1/comments') || urlString.includes('/pulls/1/comments')) {
          throw new Error('Bot PR comment endpoints should not be queried');
        }

        throw new Error(`Unexpected fetch: ${urlString}`);
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
    });

    expect(summary.totalOpenPullRequests).toBe(2);
    expect(summary.teamOpenPullRequests).toBe(1);
    expect(summary.externalOpenPullRequests).toBe(1);

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.authorLogin).toBe('some-user');
    expect(summary.externalOpenPullRequestsList.some(pr => pr.authorLogin === 'renovate')).toBe(
      false
    );

    fetchMock.mockRestore();
  });

  it('does not compute teamCommented for bot-authored PRs', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 1,
        title: 'bot pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/1',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'dependabot', type: 'Bot' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        // List pulls endpoint includes query params (e.g. /pulls?state=open...)
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (
          urlString.includes('/orgs/Kilo-Org/members/') ||
          urlString.includes('/issues/1/comments') ||
          urlString.includes('/pulls/1/comments') ||
          urlString.includes('/pulls/1/reviews')
        ) {
          throw new Error('No membership/comment checks expected for bot-only PR list');
        }

        throw new Error(`Unexpected fetch: ${urlString}`);
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
    });

    expect(summary.totalOpenPullRequests).toBe(1);
    expect(summary.teamOpenPullRequests).toBe(1);
    expect(summary.externalOpenPullRequests).toBe(0);
    expect(summary.externalOpenPullRequestsList).toHaveLength(0);

    fetchMock.mockRestore();
  });
});

describe('getKilocodeRepoRecentlyClosedExternalPRs', () => {
  it('classifies merged vs closed-unmerged, derives displayDate, and excludes bots + org members', async () => {
    const closedPrsJson = [
      {
        number: 1,
        title: 'Merged external PR',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/1',
        closed_at: '2024-01-02T00:00:00.000Z',
        merged_at: '2024-01-01T00:00:00.000Z',
        user: { login: 'external-user', type: 'User' },
      },
      {
        number: 2,
        title: 'Closed external PR',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/2',
        closed_at: '2024-01-03T00:00:00.000Z',
        merged_at: null,
        user: { login: 'external-user-2', type: 'User' },
      },
      {
        number: 3,
        title: 'Bot PR should be excluded',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/3',
        closed_at: '2024-01-04T00:00:00.000Z',
        merged_at: null,
        user: { login: 'renovate', type: 'Bot' },
      },
      {
        number: 4,
        title: 'Org member PR should be excluded',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/4',
        closed_at: '2024-01-05T00:00:00.000Z',
        merged_at: null,
        user: { login: 'kilo-team-member', type: 'User' },
      },
    ];

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (
          urlString.includes('/repos/Kilo-Org/kilocode/pulls?') &&
          urlString.includes('state=closed')
        ) {
          return mockGithubJsonResponse(closedPrsJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user-2')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const result = await getKilocodeRepoRecentlyClosedExternalPRs({ ttlMs: 0, maxResults: 50 });

    expect(result.prs.map(pr => pr.number)).toEqual([2, 1]);
    expect(result.prs[0]?.status).toBe('closed');
    expect(result.prs[0]?.displayDate).toBe('2024-01-03T00:00:00.000Z');
    expect(result.prs[1]?.status).toBe('merged');
    expect(result.prs[1]?.displayDate).toBe('2024-01-01T00:00:00.000Z');

    expect(typeof result.thisWeekMergedCount).toBe('number');
    expect(typeof result.thisWeekClosedCount).toBe('number');
    expect(typeof result.weekStart).toBe('string');

    fetchMock.mockRestore();
  });
});

describe('getKilocodeRepoOpenPullRequestsSummary draft filtering', () => {
  it('excludes draft PRs by default from counts and external list', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 1,
        title: 'draft external pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/1',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: true,
        comments: 0,
        review_comments: 0,
        user: { login: 'draft-user', type: 'User' },
      },
      {
        number: 2,
        title: 'ready external pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/2',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 1,
        review_comments: 2,
        user: { login: 'some-user', type: 'User' },
      },
      {
        number: 3,
        title: 'draft bot pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/3',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: true,
        comments: 0,
        review_comments: 0,
        user: { login: 'renovate', type: 'Bot' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        // List pulls endpoint includes query params (e.g. /pulls?state=open...)
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/issues/') || urlString.includes('/pulls/')) {
          return mockGithubJsonResponse([]);
        }

        throw new Error(`Unexpected fetch: ${urlString}`);
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
    });

    // Only PR #2 should be considered.
    expect(summary.totalOpenPullRequests).toBe(1);
    expect(summary.teamOpenPullRequests).toBe(0);
    expect(summary.externalOpenPullRequests).toBe(1);
    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(2);

    fetchMock.mockRestore();
  });

  it('includes draft PRs when includeDrafts=true', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 1,
        title: 'draft external pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/1',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: true,
        comments: 0,
        review_comments: 0,
        user: { login: 'draft-user', type: 'User' },
      },
      {
        number: 2,
        title: 'ready external pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/2',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 1,
        review_comments: 2,
        user: { login: 'some-user', type: 'User' },
      },
      {
        number: 3,
        title: 'draft bot pr',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/3',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: true,
        comments: 0,
        review_comments: 0,
        user: { login: 'renovate', type: 'Bot' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        // List pulls endpoint includes query params (e.g. /pulls?state=open...)
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/')) {
          return new Response('', { status: 404 });
        }

        // Comment endpoints should be hit only for external PRs (1 and 2), not the bot PR.
        if (
          urlString.includes('/issues/1/comments') ||
          urlString.includes('/pulls/1/comments') ||
          urlString.includes('/issues/2/comments') ||
          urlString.includes('/pulls/2/comments')
        ) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/pulls/1/reviews') || urlString.includes('/pulls/2/reviews')) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/issues/3/comments') || urlString.includes('/pulls/3/comments')) {
          throw new Error('Bot PR comment endpoints should not be queried');
        }

        throw new Error(`Unexpected fetch: ${urlString}`);
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      includeDrafts: true,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
    });

    expect(summary.totalOpenPullRequests).toBe(3);
    expect(summary.teamOpenPullRequests).toBe(1);
    expect(summary.externalOpenPullRequests).toBe(2);
    expect(summary.externalOpenPullRequestsList.map(pr => pr.number).sort((a, b) => a - b)).toEqual(
      [1, 2]
    );

    fetchMock.mockRestore();
  });
});

describe('getKilocodeRepoOpenPullRequestsSummary team approval classification', () => {
  it('treats PRs with a team APPROVED review as teamCommented even when there are zero comments', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 10,
        title: 'external pr needing approval signal',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/10',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/10/reviews')) {
          return mockGithubJsonResponse([
            { state: 'APPROVED', user: { login: 'kilo-team-member' } },
          ]);
        }

        // List pulls endpoint includes query params (e.g. /pulls?state=open...)
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        // PR author is external.
        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        // Comments are empty.
        if (urlString.includes('/issues/10/comments') || urlString.includes('/pulls/10/comments')) {
          return mockGithubJsonResponse([]);
        }

        // Approver is in the org.
        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }

        // Returning a non-retriable status here helps avoid tests hanging due to
        // fetchWithBackoff retrying thrown errors.
        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(10);
    expect(summary.externalOpenPullRequestsList[0]?.teamCommented).toBe(true);

    fetchMock.mockRestore();
  });

  it('treats PRs with a team COMMENTED review as teamCommented even when there are zero comments', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 11,
        title: 'external pr needing reviewed signal',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/11',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/11/reviews')) {
          return mockGithubJsonResponse([
            { state: 'COMMENTED', user: { login: 'kilo-team-member' } },
          ]);
        }

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/issues/11/comments')) {
          return mockGithubJsonResponse([]);
        }

        // Review comments should not be queried because team-reviewed already short-circuits.
        if (urlString.includes('/pulls/11/comments')) {
          throw new Error(
            'Review comments should not be queried when a team review already exists'
          );
        }

        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(11);
    expect(summary.externalOpenPullRequestsList[0]?.teamCommented).toBe(true);

    fetchMock.mockRestore();
  });

  it('treats PRs with a team CHANGES_REQUESTED review as teamCommented even when there are zero comments', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 12,
        title: 'external pr needing changes requested signal',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/12',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/12/reviews')) {
          return mockGithubJsonResponse([
            { state: 'CHANGES_REQUESTED', user: { login: 'kilo-team-member' } },
          ]);
        }

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/issues/12/comments')) {
          return mockGithubJsonResponse([]);
        }

        // Review comments should not be queried because team-reviewed already short-circuits.
        if (urlString.includes('/pulls/12/comments')) {
          throw new Error(
            'Review comments should not be queried when a team review already exists'
          );
        }

        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(12);
    expect(summary.externalOpenPullRequestsList[0]?.teamCommented).toBe(true);

    fetchMock.mockRestore();
  });

  it('treats PRs with a team inline review comment as teamCommented even when there are zero issue comments and no reviews', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 13,
        title: 'external pr needing inline review comment signal',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/13',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 1,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/13/reviews')) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        if (urlString.includes('/issues/13/comments')) {
          return mockGithubJsonResponse([]);
        }

        if (urlString.includes('/pulls/13/comments')) {
          return mockGithubJsonResponse([{ user: { login: 'kilo-team-member' } }]);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(13);
    expect(summary.externalOpenPullRequestsList[0]?.teamCommented).toBe(true);

    fetchMock.mockRestore();
  });

  it('does not treat external-only reviews/comments as teamCommented', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 14,
        title: 'external pr with external-only interaction',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/14',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 1,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/14/reviews')) {
          return mockGithubJsonResponse([
            { state: 'COMMENTED', user: { login: 'external-reviewer' } },
          ]);
        }

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        // PR author is external.
        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        // Issue comments are empty.
        if (urlString.includes('/issues/14/comments')) {
          return mockGithubJsonResponse([]);
        }

        // Inline review comment from an external user.
        if (urlString.includes('/pulls/14/comments')) {
          return mockGithubJsonResponse([{ user: { login: 'external-reviewer' } }]);
        }

        // Reviewer is NOT in the org.
        if (urlString.includes('/orgs/Kilo-Org/members/external-reviewer')) {
          return new Response('', { status: 404 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    expect(summary.externalOpenPullRequestsList).toHaveLength(1);
    expect(summary.externalOpenPullRequestsList[0]?.number).toBe(14);
    expect(summary.externalOpenPullRequestsList[0]?.teamCommented).toBe(false);

    fetchMock.mockRestore();
  });

  it('computes reviewStatus with precedence and ignores external-only approvals', async () => {
    const prListJson = parseGithubListPullRequestsSummaryResponse([
      {
        number: 20,
        title: 'external pr with mixed reviews',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/20',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'external-user', type: 'User' },
      },
      {
        number: 21,
        title: 'external pr approved by external only',
        html_url: 'https://github.com/Kilo-Org/kilocode/pull/21',
        created_at: '2020-01-01T00:00:00.000Z',
        draft: false,
        comments: 0,
        review_comments: 0,
        user: { login: 'external-user', type: 'User' },
      },
    ]);

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const urlString = typeof input === 'string' ? input : input.toString();

        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls?')) {
          return mockGithubJsonResponse(prListJson);
        }

        if (urlString.includes('/orgs/Kilo-Org/members/external-user')) {
          return new Response('', { status: 404 });
        }

        // PR #20: same reviewer submits multiple reviews; latest wins.
        // Final state has CHANGES_REQUESTED by external-reviewer, so precedence should pick it.
        // Also includes a team approval, which should not override changes requested.
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/20/reviews')) {
          return mockGithubJsonResponse([
            { state: 'APPROVED', user: { login: 'external-reviewer' } },
            { state: 'COMMENTED', user: { login: 'external-reviewer' } },
            { state: 'CHANGES_REQUESTED', user: { login: 'external-reviewer' } },
            { state: 'APPROVED', user: { login: 'kilo-team-member' } },
          ]);
        }

        // PR #21: only external approval; should NOT be considered approved.
        if (urlString.includes('/repos/Kilo-Org/kilocode/pulls/21/reviews')) {
          return mockGithubJsonResponse([
            { state: 'APPROVED', user: { login: 'external-reviewer' } },
          ]);
        }

        if (urlString.includes('/issues/20/comments') || urlString.includes('/pulls/20/comments')) {
          return mockGithubJsonResponse([]);
        }
        if (urlString.includes('/issues/21/comments') || urlString.includes('/pulls/21/comments')) {
          return mockGithubJsonResponse([]);
        }

        // Membership checks.
        if (urlString.includes('/orgs/Kilo-Org/members/kilo-team-member')) {
          return new Response(null, { status: 204 });
        }
        if (urlString.includes('/orgs/Kilo-Org/members/external-reviewer')) {
          return new Response('', { status: 404 });
        }

        return new Response('', { status: 404, statusText: `Unexpected fetch: ${urlString}` });
      });

    const summary = await getKilocodeRepoOpenPullRequestsSummary({
      ttlMs: 0,
      commentConcurrency: 1,
      maxIssueCommentPages: 1,
      maxReviewCommentPages: 1,
      maxPullRequestReviewPages: 1,
    });

    const pr20 = summary.externalOpenPullRequestsList.find(pr => pr.number === 20);
    const pr21 = summary.externalOpenPullRequestsList.find(pr => pr.number === 21);

    expect(pr20?.reviewStatus).toBe('changes_requested');
    expect(pr21?.reviewStatus).toBe('no_reviews');

    fetchMock.mockRestore();
  });
});
