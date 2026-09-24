/**
 * @module
 * What every Redis-backed adapter shares: how its URL is assembled from environment variables,
 * the client options node-redis connects with, and how a client is closed on shutdown.
 *
 * Left OUT on purpose, because each adapter genuinely differs: the `error` listener (a cache
 * degrades quietly, the rate limiter logs at `error`) and the retry behaviour around `connect()`
 * itself (the cache builds a fresh client per attempt; the rate limiter keeps one client across
 * attempts because node-redis rejects a second `connect()` racing the first).
 */

import { createClient } from 'redis';

/**
 * `redis://host:port`, built from separate host/port variables — the fallback shape when no full
 * URI is configured.
 *
 * `undefined` when the port is unset: the signal that this piece of config was not supplied,
 * for the caller to fall back to a default URL or treat Redis as unconfigured.
 *
 * @param hostVariable - the env var carrying the host; defaults to `127.0.0.1` when unset
 * @param portVariable - the env var carrying the port
 */
export const redisUrlFromHostPort = (
    hostVariable: string,
    portVariable: string
): string | undefined => {
    const port = process.env[portVariable];
    if (!port) return undefined;

    const host = process.env[hostVariable] ?? '127.0.0.1';
    return `redis://${host}:${port}`;
};

/**
 * How long one command may wait to be SENT — queued while the socket is still connecting, say.
 * The same budget as connecting: a cache or rate-limit lookup must never dominate request latency.
 */
const COMMAND_TIMEOUT_MS = 1000;

/**
 * node-redis client options every adapter here connects with.
 * https://github.com/redis/node-redis/blob/master/docs/client-configuration.md
 *
 * - `connectTimeout`: fail a connect fast (1s).
 * - `reconnectStrategy: false`: no background reconnect loop, which would retry forever and log
 *   on every attempt; each adapter drives its own recovery from the traffic that needs it.
 * - `commandOptions.timeout`: fail a command still waiting to be written after 1s (node-redis 6
 *   would otherwise apply 5s). It does NOT cover a reply that never comes: node-redis drops the
 *   timer once the command is on the wire, so a half-open connection still waits on the kernel.
 * - `RESP: 2` and `maintNotifications: 'disabled'`: node-redis 6 defaults to RESP3 and, with it,
 *   to Enterprise maintenance handling. Stated rather than inherited, so the wire format the
 *   callers (and `rate-limit-redis`'s raw commands) were written against stays the one in use.
 *   https://github.com/redis/node-redis/blob/master/docs/v5-to-v6.md
 *
 * @param url - the Redis URL to connect with
 */
export const redisClientOptions = (url: string) => ({
    url,
    RESP: 2 as const,
    maintNotifications: 'disabled' as const,
    socket: {
        connectTimeout: 1000,
        // A literal `false`, not `boolean`: node-redis' socket options require the literal to
        // disable the reconnect loop rather than accepting a plain boolean.
        reconnectStrategy: false as const
    },
    commandOptions: { timeout: COMMAND_TIMEOUT_MS }
});

/**
 * A client built from {@link redisClientOptions} — every adapter here builds its client through
 * {@link createRedisClient}, so this is the one client type they share.
 *
 * @param url - the Redis URL to connect with
 */
export const createRedisClient = (url: string) => createClient(redisClientOptions(url));

/**
 * The client type {@link createRedisClient} builds. Derived rather than spelled out: node-redis 6's
 * own `RedisClientType` defaults its protocol parameter to RESP3, and this client speaks RESP2.
 */
export type RedisClient = ReturnType<typeof createRedisClient>;

/**
 * Close a Redis client gracefully, or do nothing when none was ever built.
 *
 * `close()` waits for queued replies, then closes — the polite close (it replaces the deprecated
 * `quit()`). If that fails (an already-dead socket), `destroy()` drops the socket immediately,
 * discarding anything still queued.
 *
 * @param client - the client to close, or `undefined` when nothing was ever opened
 */
export const closeRedisClient = (client: RedisClient | undefined): Promise<void> =>
    client
        ? client.close().then(
              () => undefined,
              () => client.destroy()
          )
        : Promise.resolve();
