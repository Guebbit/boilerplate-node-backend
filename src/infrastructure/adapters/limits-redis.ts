/**
 * @module
 * The connection to the `limits` Redis: the instance that holds what must NOT be evicted.
 *
 * Holds:   the rate-limit counters, and the single-use claims (a spent ALTCHA solution).
 * Why:     eviction is per Redis INSTANCE. The response cache runs `allkeys-lru` and may drop any
 *          key under pressure; a counter or a claim dropped that way is a budget reset or a
 *          replayable solution. So these live on their own instance, `noeviction`, and a flood of
 *          cache keys can never reach them. https://redis.io/docs/latest/develop/reference/eviction/
 * Unset:   `NODE_RATE_LIMIT_REDIS_URL` has no fallback to the cache's URL. No URL means the
 *          in-process stores, and each instance is named explicitly.
 *
 * See: docs/tools/redis-cache.md#two-redis-instances
 */

import type { RedisReply } from 'rate-limit-redis';
import { logger } from '@infrastructure/adapters/logger';
import {
    manageConnection,
    type ManagedConnection
} from '@infrastructure/adapters/managed-connection';
import {
    closeRedisClient,
    createRedisClient,
    type RedisClient
} from '@infrastructure/adapters/redis';
import { rateLimitConfig } from '@infrastructure/http/config';

/**
 * Key namespace of everything on the `limits` instance. Separate from the cache's prefix so
 * `NODE_REDIS_CACHE_PREFIX` can be rotated, or the cache flushed wholesale, without resetting
 * anyone's budget or reopening a spent claim.
 */
export const limitsKeyPrefix = (): string => rateLimitConfig().NODE_RATE_LIMIT_REDIS_PREFIX;

/**
 * The `limits` instance's URL, or `undefined` when none is configured. Never the cache's: the two
 * instances differ in eviction policy, so one unset variable must not turn them into one.
 * The config layer reads a blank `NAME=` as unset.
 */
export const limitsRedisUrl = (): string | undefined => rateLimitConfig().NODE_RATE_LIMIT_REDIS_URL;

/**
 * Construct (but do not connect) a client for the `limits` instance.
 *
 * @param url - the instance's URL — see {@link limitsRedisUrl}
 */
export const buildLimitsClient = (url: string): RedisClient => {
    const redisClient: RedisClient = createRedisClient(url);

    // node-redis is an EventEmitter and an unhandled 'error' event would crash the process, so this
    // listener is mandatory rather than merely useful.
    redisClient.on('error', () => undefined);

    return redisClient;
};

/**
 * The one client every limiter and claim shares — lifecycle (memoised handle, deduped connect,
 * warn-once) delegated to {@link manageConnection}. Unlike the cache, `getOrThrow` rejects instead
 * of resolving `undefined`: each caller decides its own safe fallback.
 */
let limitsConnection: ManagedConnection<RedisClient> | undefined;

/** Builds {@link limitsConnection} on first call, from `url`, and memoises it thereafter. */
const connectionFor = (url: string): ManagedConnection<RedisClient> => {
    if (limitsConnection) return limitsConnection;

    // Kept apart from `manageConnection`'s own memoised handle: a client whose handshake hasn't
    // finished is still the SAME socket worth reconnecting, not one to throw away. node-redis
    // rejects a second `connect()` racing the first with `Socket already opened`, so a fresh
    // client per attempt (like the cache adapter) is not an option here.
    let redisClient: RedisClient | undefined;

    const connection = manageConnection<RedisClient>({
        unavailableMessage:
            'Limits Redis unreachable — until it returns, budgets count in this process alone (the browsing brake passes unbudgeted) and single-use claims are per process.',
        unavailableLevel: 'error',
        // Enablement is already decided by whoever builds a Redis-backed store: this connection
        // only exists when a URL is configured.
        isEnabled: () => true,
        connect: () => {
            redisClient ??= buildLimitsClient(url);
            const client = redisClient;

            return client.connect().then(
                () => client,
                (error: unknown) => {
                    redisClient = undefined;
                    client.destroy();
                    throw error;
                }
            );
        },
        isReady: (client) => client.isReady,
        close: (client) => {
            redisClient = undefined;
            return closeRedisClient(client);
        },
        onRecovered: () =>
            // Stryker disable next-line all
            logger.info({ message: 'Limits Redis is back — counters are shared again.' })
    });

    limitsConnection = {
        ...connection,
        forget: () => {
            redisClient = undefined;
            connection.forget();
        }
    };

    return limitsConnection;
};

/**
 * Send one raw command to the `limits` instance, opening the connection if this is the first
 * caller. Rejects when Redis cannot be reached; the client is forgotten on failure so the next
 * command starts from a clean socket instead of retrying a dead one.
 *
 * The reply type is stated, not inferred: node-redis answers a wide `ReplyUnion` for an arbitrary
 * command, and `rate-limit-redis`'s own `RedisReply` is the shape its commands answer with.
 *
 * @param url - the instance's URL
 * @param command - the command and its arguments, as `sendCommand` takes them
 */
export const sendToLimits = (url: string, command: string[]): Promise<RedisReply> => {
    const connection = connectionFor(url);

    return connection.getOrThrow().then((redisClient) =>
        redisClient.sendCommand<RedisReply>(command).catch((error: unknown) => {
            redisClient.destroy();
            connection.forget();
            connection.reportUnavailable(error);
            throw error;
        })
    );
};

/** Release the connection on shutdown, so a restart begins from a clean socket. */
export const stopLimitsRedis = (): Promise<void> =>
    limitsConnection ? limitsConnection.stop() : Promise.resolve();

/**
 * Namespace a single-use claim under {@link limitsKeyPrefix}.
 *
 * @param key - what is claimed, e.g. `antibot:spent:<id>`
 */
const claimKey = (key: string): string => `${limitsKeyPrefix()}:claim:${key}`;

/**
 * Claim `key` for `seconds`, once, across every worker and replica: `SET NX EX` succeeds for
 * exactly one caller. https://redis.io/commands/set/
 *
 * @param key - what to claim
 * @param seconds - how long the claim stands
 * @returns `claimed` for the one winner, `taken` for everyone after it, `unavailable` when there
 *   is no `limits` Redis to ask or it failed — the caller keeps its in-process floor
 */
export const claimLimitsKey = (
    key: string,
    seconds: number
): Promise<'claimed' | 'taken' | 'unavailable'> => {
    const url = limitsRedisUrl();
    if (!url) return Promise.resolve('unavailable');

    return sendToLimits(url, ['SET', claimKey(key), '1', 'NX', 'EX', String(seconds)])
        .then((reply) => (reply === 'OK' ? ('claimed' as const) : ('taken' as const)))
        .catch((error: unknown) => {
            // Stryker disable next-line all
            logger.warn({ message: 'Limits Redis claim failed.', key, error });
            return 'unavailable' as const;
        });
};

/**
 * Whether `key` is currently claimed, WITHOUT claiming it — a read-only `EXISTS`.
 * https://redis.io/commands/exists/
 *
 * @param key - the name {@link claimLimitsKey} was given
 * @returns true only when Redis answered that the claim stands; false on a miss, no Redis or any
 *   failure — the caller keeps its in-process floor
 */
export const isLimitsKeyClaimed = (key: string): Promise<boolean> => {
    const url = limitsRedisUrl();
    if (!url) return Promise.resolve(false);

    return sendToLimits(url, ['EXISTS', claimKey(key)])
        .then((reply) => reply === 1)
        .catch((error: unknown) => {
            // Stryker disable next-line all
            logger.warn({ message: 'Limits Redis claim lookup failed.', key, error });
            return false;
        });
};
