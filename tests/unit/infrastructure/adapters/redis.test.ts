/**
 * `isRedisConnectionError` — `src/infrastructure/adapters/redis.ts`. The rest of the module
 * (client construction, close) is exercised through the cache/rate-limit adapters that actually
 * open a socket; this is the one pure fact worth its own unit test.
 */

import {
    ClientClosedError,
    ClientOfflineError,
    ConnectionTimeoutError,
    SocketClosedUnexpectedlyError,
    SocketTimeoutError
} from 'redis';
import { isRedisConnectionError } from '@infrastructure/adapters/redis';

describe('isRedisConnectionError', () => {
    // The real classes, as node-redis throws them — each reports `.name === 'Error'`.
    it.each([
        new ClientClosedError(),
        new ClientOfflineError(),
        new ConnectionTimeoutError(),
        new SocketClosedUnexpectedlyError(),
        new SocketTimeoutError(1000)
    ])('recognises %p', (error) => {
        expect(isRedisConnectionError(error)).toBe(true);
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isRedisConnectionError(new Error('WRONGTYPE Operation against a key'))).toBe(false);
        expect(isRedisConnectionError(undefined)).toBe(false);
    });
});
