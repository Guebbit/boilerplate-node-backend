---
source: src/infrastructure/adapters/redis.ts
generated_at: 2026-11-22T02:41:53.143584+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/redis.ts

## Purpose
Shared building blocks for every Redis-backed adapter: how the Redis URL is assembled from environment config, the node-redis client options, how a client is closed on shutdown, and how to recognise "server unreachable" errors. Behaviour that genuinely differs per adapter (the `error` listener, retry around `connect()`) is deliberately left out.

## Key elements
- `configuredRedisUrl()` — returns `NODE_REDIS_URL` if set; otherwise builds `redis://[:password@]host:port` from the configured host, port and password (password URL-encoded). Returns `undefined` when neither URL nor port is configured, meaning "Redis not supplied" rather than an error.
- `createRedisClient(url)` — wraps `createClient` with the shared (private) `redisClientOptions`.
- `RedisClient` — type derived via `ReturnType<typeof createRedisClient>`, so it reflects RESP2 instead of node-redis 6's RESP3 default.
- `closeRedisClient(client)` — no-op for `undefined`; otherwise `close()` (graceful), falling back to `destroy()` if that fails.
- `isRedisConnectionError(error)` — `instanceof` check against `ClientClosedError`, `ClientOfflineError`, `ConnectionTimeoutError`, `SocketClosedUnexpectedlyError`, `SocketTimeoutError`.

## Relationships
- Reads `redisConfig()` from `config.ts` to build the URL.
- Documented as the shared base for the Redis adapters; `cache.ts` and `limits-redis.ts` are the adapters (the cache builds a fresh client per connect attempt, the rate limiter keeps one client). The docblocks also name `cacheState()` and `rate-limit-redis`, which `rate-limit-store.ts` presumably wires up.
- `tests/replicas/redis-idle.test.ts` relates to the idle/keepalive behaviour (`socketTimeout` plus `pingInterval`).
- `pubsub.ts` is not referenced in this file.

## Notes
- Client options: 1s `connectTimeout`, 1s command timeout (`COMMAND_TIMEOUT_MS`) and `socketTimeout`, `pingInterval` 500ms, `reconnectStrategy: false`, `RESP: 2`, `maintNotifications: 'disabled'`.
- `commandOptions.timeout` only covers commands waiting to be sent, not a missing reply. `socketTimeout` guards half-open connections, but as an idle timer it would close healthy idle connections, so `pingInterval` (500ms, under the 1s ceiling) keeps them alive. Without it, the next call hit a closed client and `cacheState()` read `unavailable`.
- `reconnectStrategy: false` means no background reconnect loop; each adapter drives its own recovery.
- node-redis error classes don't set `.name`, so matching must use `instanceof` (unlike `mongo-errors.ts`, which matches by name).
- `isRedisConnectionError` is meant to give an unreachable Redis the same status as a Mongo outage, as referenced from `databaseErrorInterpreter` in `infrastructure/http/errors.ts`.
