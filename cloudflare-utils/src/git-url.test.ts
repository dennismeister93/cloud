import { describe, it, expect } from 'vitest';
import { sanitizeGitUrl } from './git-url';

describe('sanitizeGitUrl', () => {
  it('strips username and password from HTTPS URL', () => {
    expect(sanitizeGitUrl('https://user:password@github.com/user/repo')).toBe(
      'https://github.com/user/repo'
    );
  });

  it('strips token-style credentials from HTTPS URL', () => {
    expect(sanitizeGitUrl('https://x-access-token:ghp_abc123@github.com/org/repo.git')).toBe(
      'https://github.com/org/repo.git'
    );
  });

  it('strips query params and hash from HTTPS URL', () => {
    expect(sanitizeGitUrl('https://github.com/user/repo?token=secret#readme')).toBe(
      'https://github.com/user/repo'
    );
  });

  it('strips everything sensitive from HTTPS URL at once', () => {
    expect(sanitizeGitUrl('https://user:password@github.com/user/repo?token=secret#readme')).toBe(
      'https://github.com/user/repo'
    );
  });

  it('passes through clean HTTPS URLs unchanged', () => {
    expect(sanitizeGitUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo');
  });

  it('handles SSH URLs unchanged', () => {
    expect(sanitizeGitUrl('git@github.com:user/repo.git')).toBe('git@github.com:user/repo.git');
  });

  it('strips query params from SSH URLs', () => {
    expect(sanitizeGitUrl('git@github.com:user/repo.git?token=secret')).toBe(
      'git@github.com:user/repo.git'
    );
  });

  it('returns unparseable strings as-is', () => {
    expect(sanitizeGitUrl('not-a-url')).toBe('not-a-url');
  });

  it('handles HTTP URLs', () => {
    expect(sanitizeGitUrl('http://token@example.com/repo.git')).toBe('http://example.com/repo.git');
  });
});
