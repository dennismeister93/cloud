import { PROVIDERS } from '@/lib/providers';
import { generateProviderSpecificHash } from './providerHash';

describe('generateProviderSpecificHash', () => {
  const testUserId = 'test-user-123';

  it('should generate different hashes for different providers', () => {
    const openRouterHash = generateProviderSpecificHash(testUserId, PROVIDERS.OPENROUTER);
    const grokHash = generateProviderSpecificHash(testUserId, PROVIDERS.XAI);

    expect(openRouterHash).not.toBe(grokHash);
  });

  it('should generate consistent hashes for the same provider and user', () => {
    const hash1 = generateProviderSpecificHash(testUserId, PROVIDERS.OPENROUTER);
    const hash2 = generateProviderSpecificHash(testUserId, PROVIDERS.OPENROUTER);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different users on the same provider', () => {
    const user1Hash = generateProviderSpecificHash('user1', PROVIDERS.OPENROUTER);
    const user2Hash = generateProviderSpecificHash('user2', PROVIDERS.OPENROUTER);

    expect(user1Hash).not.toBe(user2Hash);
  });

  it('should return a base64 encoded string', () => {
    const hash = generateProviderSpecificHash(testUserId, PROVIDERS.XAI);

    // Base64 pattern check
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
