/**
 * Unit tests for `pseudonymise`: stable, keyed, and separated per purpose.
 */

import { createHash, createHmac } from 'node:crypto';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { setEnvironment } from '@tests/environment';

describe('pseudonymise', () => {
    beforeEach(() => {
        setEnvironment({ NODE_PSEUDONYM_KEY: 'a-root-secret-for-tests' });
    });

    it('is stable and returns a full 64-hex HMAC-SHA256 digest', () => {
        const digest = pseudonymise('log', 'ada@example.com');
        expect(digest).toMatch(/^[\da-f]{64}$/);
        expect(pseudonymise('log', 'ada@example.com')).toBe(digest);
    });

    it('differs for different values', () => {
        expect(pseudonymise('log', 'a')).not.toBe(pseudonymise('log', 'b'));
    });

    it('differs per purpose for the same value', () => {
        const digests = new Set([
            pseudonymise('log', 'x'),
            pseudonymise('rate-limit', 'x'),
            pseudonymise('idempotency', 'x')
        ]);
        expect(digests.size).toBe(3);
    });

    it('differs under a different root secret', () => {
        const before = pseudonymise('rate-limit', 'x');
        setEnvironment({ NODE_PSEUDONYM_KEY: 'another-root-secret' });
        expect(pseudonymise('rate-limit', 'x')).not.toBe(before);
    });

    it('is never the bare or single-key digest of the value', () => {
        const digest = pseudonymise('idempotency', 'x');
        expect(digest).not.toBe(createHash('sha256').update('x').digest('hex'));
        expect(digest).not.toBe(
            createHmac('sha256', 'a-root-secret-for-tests').update('x').digest('hex')
        );
    });

    it('falls back to a stable dev key when the root is unset', () => {
        setEnvironment({ NODE_PSEUDONYM_KEY: undefined });
        expect(pseudonymise('log', 'x')).toBe(pseudonymise('log', 'x'));
    });
});
