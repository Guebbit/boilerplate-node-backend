import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';

/**
 * Unit table for the SSRF guard's address and port rules. Literal IPs never reach DNS, so no
 * resolver is mocked here; the hostile-URL table lives in `tests/fuzz/ssrf-guard.fuzz.test.ts`.
 */

describe('resolveSafeOutboundTarget — the deprecated IPv4-compatible block ::/96', () => {
    it.each([
        ['loopback inside ::/96', 'https://[::7f00:1]/hook'],
        ['cloud metadata endpoint inside ::/96', 'https://[::a9fe:a9fe]/hook']
    ])('refuses %s', async (_label, url) => {
        await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
            reason: 'unsafe-address'
        });
    });
});
