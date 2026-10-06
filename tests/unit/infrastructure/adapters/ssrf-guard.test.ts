import { resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';
import {
    clearSsrfExemptOrigins,
    registerSsrfExemptOrigin
} from '@infrastructure/adapters/ssrf-exemptions';
import { setEnvironment } from '@tests/environment';

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

describe('resolveSafeOutboundTarget — the port rule', () => {
    afterEach(() => {
        clearSsrfExemptOrigins();
        setEnvironment({ NODE_OUTBOUND_ALLOWED_PORTS: undefined });
    });

    it.each(['https://8.8.8.8:22/x', 'https://8.8.8.8:6379/x', 'https://8.8.8.8:8443/x'])(
        'refuses %s with unsafe-port',
        async (url) => {
            await expect(resolveSafeOutboundTarget(url)).rejects.toMatchObject({
                reason: 'unsafe-port'
            });
        }
    );

    it.each(['https://8.8.8.8/x', 'https://8.8.8.8:443/x'])('allows %s', async (url) => {
        await expect(resolveSafeOutboundTarget(url)).resolves.toMatchObject({
            resolvedAddress: '8.8.8.8'
        });
    });

    it('allows a port the operator listed, and only that one', async () => {
        setEnvironment({ NODE_OUTBOUND_ALLOWED_PORTS: '8443, 9443' });

        await expect(resolveSafeOutboundTarget('https://8.8.8.8:8443/x')).resolves.toBeDefined();
        await expect(resolveSafeOutboundTarget('https://8.8.8.8:22/x')).rejects.toMatchObject({
            reason: 'unsafe-port'
        });
    });

    it('lets an exempt origin through on its own port only', async () => {
        registerSsrfExemptOrigin('https://127.0.0.1:3070');

        await expect(resolveSafeOutboundTarget('https://127.0.0.1:3070/x')).resolves.toBeDefined();
        await expect(resolveSafeOutboundTarget('https://127.0.0.1:3071/x')).rejects.toMatchObject({
            reason: 'unsafe-port'
        });
    });
});
