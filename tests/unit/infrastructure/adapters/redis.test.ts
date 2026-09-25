/**
 * `isRedisConnectionError` — `src/infrastructure/adapters/redis.ts`. The rest of the module
 * (client construction, close) is exercised through the cache/rate-limit adapters that actually
 * open a socket; this is the one pure fact worth its own unit test.
 */

import { isRedisConnectionError } from '@infrastructure/adapters/redis';

describe('isRedisConnectionError', () => {
    it.each([
        'ClientClosedError',
        'ClientOfflineError',
        'ConnectionTimeoutError',
        'SocketClosedUnexpectedlyError',
        'SocketTimeoutError'
    ])('recognises %s by name, never instanceof', (name) => {
        expect(isRedisConnectionError(Object.assign(new Error('unreachable'), { name }))).toBe(
            true
        );
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isRedisConnectionError(new Error('WRONGTYPE Operation against a key'))).toBe(false);
        expect(isRedisConnectionError(undefined)).toBe(false);
    });
});
