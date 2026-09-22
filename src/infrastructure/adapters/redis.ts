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

import type { RedisClientType } from 'redis';

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
 * node-redis client options every adapter here connects with.
 *
 * https://github.com/redis/node-redis/blob/master/docs/client-configuration.md — `connectTimeout`
 * fails fast (1s) so a cache or rate-limit lookup never dominates request latency; `reconnectStrategy:
 * false` disables node-redis' own background reconnect loop, which would retry forever and log on
 * every attempt, so each adapter drives its own recovery from the traffic that needs the connection.
 *
 * @param url - the Redis URL to connect with
 */
export const redisClientOptions = (url: string) => ({
    url,
    socket: {
        connectTimeout: 1000,
        // A literal `false`, not `boolean`: node-redis' socket options require the literal to
        // disable the reconnect loop rather than accepting a plain boolean.
        reconnectStrategy: false as const
    }
});

/**
 * Close a Redis client gracefully, or do nothing when none was ever built.
 *
 * `quit()` sends the QUIT command and waits for queued replies — the polite close. If QUIT itself
 * fails (an already-dead socket), `destroy()` drops the socket immediately, discarding anything
 * still queued.
 *
 * @param client - the client to close, or `undefined` when nothing was ever opened
 */
export const closeRedisClient = (client: RedisClientType | undefined): Promise<void> =>
    client
        ? client.quit().then(
              () => undefined,
              () => client.destroy()
          )
        : Promise.resolve();
