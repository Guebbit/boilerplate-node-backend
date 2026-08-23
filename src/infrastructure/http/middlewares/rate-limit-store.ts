/**
 * Where the rate limiters keep their counters.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────────────────────
 * `express-rate-limit`'s default store is an in-process `Map`. `src/cluster.ts` forks one worker
 * per CPU, and each worker would then hold its own counters — so a budget of 100 per minute is
 * really up to `100 × workers` per minute, and which bucket a request lands in depends on which
 * worker the OS handed the socket to. On a sixteen-core box that is a sixteenfold budget for
 * password guessing, and nothing in the configuration says so. Redis makes it one budget again,
 * across workers and across instances.
 *
 * ── Failing open, and saying so ──────────────────────────────────────────────────────────────
 * The cache adapter fails open because a cache is an optimisation. A rate limiter is not, so the
 * choice here is real: fail closed and a Redis outage becomes an authentication outage — nobody can
 * sign in — while failing open removes the brakes for as long as it lasts. This fails open, which
 * is the same answer the rest of the stack gives about its optional dependencies, and it is made
 * explicit rather than accidental: `passOnStoreError` in `security.ts` is what lets a request
 * through when the store errors, and every outage is logged.
 *
 * The choice of store is made ONCE, at startup, from whether Redis is configured. A store that
 * flipped between Redis and memory mid-window would reset every counter each time it flipped,
 * which is an attacker's best case: make Redis flap, and the budget never fills.
 *
 * ── Lazy, and driven by traffic ──────────────────────────────────────────────────────────────
 * No socket is opened by importing this file — only by the first request that needs one. A process
 * that imports the limiters and never serves a request (a test file, `export-seed`, `sync-frontend`)
 * must not be left holding a connection open, and one retrying a Redis that is not there would
 * never exit at all. That is not hypothetical: it is what the first version of this file did to the
 * test suite.
 *
 * Laziness takes a wrapper rather than falling out of the design, because `RedisStore.init()` loads
 * its Lua scripts eagerly — constructing one IS a round trip. `lazyRedisStore` holds the options
 * `express-rate-limit` hands it and builds the real store on the first `increment`, which is the
 * first moment a request is actually being counted.
 *
 * ── A separate connection from the cache ─────────────────────────────────────────────────────
 * One connection per concern. The cache may be switched off (`NODE_REDIS_CACHE_ENABLED=0`) while
 * the limiters must keep counting, and the two would otherwise share a kill switch.
 */

import { createClient, type RedisClientType } from 'redis';
import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { logger } from '@infrastructure/adapters/logger';
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';

/**
 * Key namespace for every limiter counter. Separate from the cache's prefix so
 * `NODE_REDIS_CACHE_PREFIX` can be rotated — or the cache flushed wholesale — without also
 * resetting everyone's budget.
 */
const KEY_PREFIX = process.env.NODE_REDIS_RATE_LIMIT_PREFIX ?? 'rate-limit';

/**
 * The limiter's own Redis URL. Falls back to the cache's, because one Redis is the normal
 * deployment and asking for the same URL twice is a way to get two different ones.
 */
const redisUrl = (): string | undefined => {
    /*
     * The explicit kill switch, the twin of `NODE_REDIS_CACHE_ENABLED`.
     *
     * Needed because the URL is INHERITED from the cache's, so "do not share counters" cannot be
     * said by leaving a variable unset — the suites are the case that proves it: `src/app.ts`
     * imports `dotenv/config`, so `.env`'s compose hostname reaches every test, and without this
     * the limiters would spend the run failing open against a Redis that is not there.
     */
    if (!environmentFlag('NODE_RATE_LIMIT_REDIS_ENABLED', true)) return;
    if (process.env.NODE_RATE_LIMIT_REDIS_URL) return process.env.NODE_RATE_LIMIT_REDIS_URL;
    if (process.env.NODE_REDIS_URL) return process.env.NODE_REDIS_URL;
    if (!process.env.NODE_REDIS_PORT) return;

    const host = process.env.NODE_REDIS_HOST ?? '127.0.0.1';
    return `redis://${host}:${process.env.NODE_REDIS_PORT}`;
};

/**
 * The one client every limiter shares, built on first use and dropped on failure.
 *
 * `undefined` means "not built yet", never "unavailable": the next command builds a fresh one, so
 * recovery is driven by traffic rather than by a retry loop nobody is waiting on. Same shape as the
 * cache adapter, and the same reason — see `infrastructure/runtime/managed-connection.ts`.
 */
let client: RedisClientType | undefined;

/**
 * The in-flight `connect()` for {@link client}, shared by every command that arrives before it
 * settles.
 *
 * One connection needs one `connect()`. Without this, each command tested `isReady` for itself and
 * called `connect()` when it was false — and `isReady` stays false for the whole handshake, so two
 * commands issued together both tried to open the same socket. node-redis answers the second with
 * `Socket already opened`, whose failure path below discards the client the FIRST one was still
 * using, and that one then fails with `The client is closed`.
 *
 * It was not a rare interleaving: `RedisStore.init()` loads two Lua scripts back to back, so the
 * pair raced on the first request every time, every worker fell back to passing requests through
 * unbudgeted, and the log said Redis was unreachable while Redis was answering fine.
 */
let connecting: Promise<void> | undefined;

/** Whether the last command failed, so an outage is logged once rather than once per request. */
let degraded = false;

const build = (url: string): RedisClientType => {
    const redisClient: RedisClientType = createClient({
        url,
        socket: {
            connectTimeout: 1000,
            /*
             * No reconnect loop, exactly like the cache's client. The loop would retry in the
             * background forever — which keeps the event loop alive, so a process that has stopped
             * serving never exits — and would log on every attempt. One clean try per command
             * instead, with the next request driving the next one.
             */
            reconnectStrategy: false
        }
    });

    // node-redis is an EventEmitter and an unhandled 'error' event would crash the process, so this
    // listener is mandatory rather than merely useful.
    redisClient.on('error', () => undefined);

    return redisClient;
};

/**
 * Send one command, opening the connection if this is the first that needs it.
 *
 * Rejects when Redis cannot be reached, which `passOnStoreError` turns into "let the request
 * through" rather than a 500 — see the header. The client is forgotten on failure so the next
 * command starts from a clean socket instead of retrying a dead one.
 */
const send = (url: string, command: string[]): Promise<RedisReply> => {
    client ??= build(url);
    const redisClient = client;

    if (!redisClient.isReady) connecting ??= redisClient.connect().then(() => undefined);

    return (
        (redisClient.isReady ? Promise.resolve() : (connecting ?? Promise.resolve()))
            /*
             * The reply type is stated rather than inferred: node-redis answers a wide `ReplyUnion`
             * for an arbitrary command, while only `INCR`, `DECR`, `PTTL` and `DEL` are ever sent from
             * here and all four answer an integer. `sendCommand`'s type parameter is where node-redis
             * asks the caller to say which command it issued.
             */
            .then(() => redisClient.sendCommand<RedisReply>(command))
            .then((reply) => {
                if (degraded) {
                    degraded = false;
                    logger.info({
                        message: 'Rate-limit Redis is back — counters are shared again.'
                    });
                }

                return reply;
            })
            .catch((error: unknown) => {
                client = undefined;
                connecting = undefined;
                redisClient.destroy();

                if (!degraded) {
                    degraded = true;
                    /*
                     * `error`, not `warn`: for as long as this lasts the budgets are not being
                     * enforced, and a security control that is off belongs at the level someone is
                     * paged for. Logged once per outage, not once per request, or the log becomes the
                     * outage.
                     */
                    logger.error({
                        message:
                            'Rate-limit Redis unreachable — requests are passing unbudgeted until it returns.',
                        error: error instanceof Error ? error.message : String(error)
                    });
                }

                throw error;
            })
    );
};

/**
 * A `RedisStore` that is not built until something is counted.
 *
 * `express-rate-limit` calls `init` while the middleware is being constructed — at module load —
 * and `RedisStore.init` loads its Lua scripts, which is a command, which is a connection. Holding
 * the options and deferring construction to the first `increment` is what keeps importing this
 * module free.
 *
 * Every method delegates; only `increment` can be the first, because `express-rate-limit` never
 * decrements or resets a key it has not counted.
 */
const lazyRedisStore = (namespace: string, url: string): Store => {
    let inner: RedisStore | undefined;
    let options: Options | undefined;

    const store = (): RedisStore => {
        if (!inner) {
            inner = new RedisStore({
                prefix: `${KEY_PREFIX}:${namespace}:`,
                // `rate-limit-redis` speaks raw Redis commands so it works with any client; this
                // is the one line that binds it to node-redis.
                sendCommand: (...command: string[]) => send(url, command)
            });
            // The options `init` was given at construction, replayed now that there is a store to
            // give them to. `windowMs` is the only one `RedisStore` reads, and it needs it.
            if (options) void inner.init(options);
        }

        return inner;
    };

    return {
        init: (received: Options) => {
            options = received;
        },
        increment: (key: string) => store().increment(key),
        decrement: (key: string) => store().decrement(key),
        resetKey: (key: string) => store().resetKey(key),
        get: (key: string) => store().get(key)
    };
};

/**
 * The store one limiter counts in.
 *
 * @param namespace - which budget these counters belong to, so two limiters sharing one Redis
 *  cannot spend each other's allowance
 * @returns a Redis-backed store when Redis is configured, an in-process one otherwise
 */
export const rateLimitStore = (namespace: string): Store => {
    const url = redisUrl();

    if (!url) {
        /*
         * `error`, not `warn`. With more than one worker this is a security control that is not
         * doing what its configuration claims, and the number in `.env` is off by a factor of the
         * worker count — that belongs at the level someone is paged for, not in the noise.
         */
        if (environmentNumber('NODE_CLUSTER_WORKERS', 0) !== 1)
            logger.error({
                message:
                    'Rate limiting is counting per process: no Redis is configured and this app runs a worker per CPU. ' +
                    'Every budget in NODE_RATE_LIMIT_* is effectively multiplied by the worker count. ' +
                    'Set NODE_REDIS_URL (or NODE_RATE_LIMIT_REDIS_URL), or run NODE_CLUSTER_WORKERS=1.',
                namespace
            });

        return new MemoryStore();
    }

    return lazyRedisStore(namespace, url);
};

/** Release the limiter's connection on shutdown, so a restart begins from a clean socket. */
export const stopRateLimitStore = (): Promise<void> => {
    if (!client) return Promise.resolve();

    const redisClient = client;
    client = undefined;
    connecting = undefined;
    degraded = false;

    return redisClient.quit().then(
        () => undefined,
        () => redisClient.destroy()
    );
};
