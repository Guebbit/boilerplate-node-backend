/**
 * @module
 * The client every Redis adapter builds, against a real Redis, left idle past its socket ceiling.
 * `socketTimeout` is node-redis' IDLE timer: without the keepalive ping a healthy client closed
 * itself after one quiet second, and the cache read `unavailable` between requests.
 */

import {
    createRedisClient,
    closeRedisClient,
    type RedisClient
} from '@infrastructure/adapters/redis';
import { startRedis, type TestRedis } from './support/redis';

/** Longer than the 1s idle ceiling, so a client with no keepalive has closed by then. */
const IDLE_MS = 2500;

describe('the shared Redis client, idle', () => {
    let redis: TestRedis;
    let client: RedisClient;

    beforeAll(() =>
        startRedis().then((started) => {
            redis = started;
            client = createRedisClient(started.url);
            client.on('error', () => undefined);
            return client.connect();
        })
    );

    afterAll(() => closeRedisClient(client).then(() => redis.stop()));

    it('stays ready past its idle ceiling and still answers', () =>
        new Promise((resolve) => setTimeout(resolve, IDLE_MS))
            .then(() => {
                expect(client.isReady).toBe(true);
                return client.ping();
            })
            .then((reply) => {
                expect(reply).toBe('PONG');
            }));
});
