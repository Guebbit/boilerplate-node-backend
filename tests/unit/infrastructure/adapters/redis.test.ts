/**
 * `src/infrastructure/adapters/redis.ts`: `isRedisConnectionError` and `configuredRedisUrl`. The
 * rest of the module (client construction, close) is exercised through the cache/rate-limit
 * adapters that actually open a socket; these are the pure facts worth their own unit test.
 */

import {
    ClientClosedError,
    ClientOfflineError,
    ConnectionTimeoutError,
    SocketClosedUnexpectedlyError,
    SocketTimeoutError
} from 'redis';
import { configuredRedisUrl, isRedisConnectionError } from '@infrastructure/adapters/redis';
import { setEnvironment } from '@tests/environment';

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

describe('configuredRedisUrl', () => {
    it('assembles the URL from host and port, and puts the password in it encoded', () => {
        setEnvironment({
            NODE_REDIS_URL: undefined,
            NODE_REDIS_HOST: 'cache',
            NODE_REDIS_PORT: '6379',
            NODE_REDIS_PASSWORD: 'p@ss/w#d'
        });

        expect(configuredRedisUrl()).toBe('redis://:p%40ss%2Fw%23d@cache:6379');
    });

    it('carries no credentials when no password is set', () => {
        setEnvironment({
            NODE_REDIS_URL: undefined,
            NODE_REDIS_HOST: 'cache',
            NODE_REDIS_PORT: '6379',
            NODE_REDIS_PASSWORD: undefined
        });

        expect(configuredRedisUrl()).toBe('redis://cache:6379');
    });
});
