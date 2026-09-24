---
source: src/infrastructure/adapters/redis.ts
sha256: e0d5e567b770bb78632a755423109e53aa40d7635305e52f7ae07eae2c48e88b
generated_at: 2026-09-23T17:41:41.382432+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/redis.ts

## Purpose

Shared Redis connection utilities for all Redis-backed adapters in this codebase. It centralises URL assembly from environment variables, the node-redis client options (timeout, reconnect policy), and graceful client shutdown. Error-handling and retry logic are intentionally *excluded* because the two consumers (cache vs. rate-limiter) handle them differently.

## Key elements

- **`redisUrlFromHostPort(hostVariable, portVariable)`** — Reads host and port from `process.env` and returns `redis://host:port`. Returns `undefined` when the port variable is unset (the "not configured" signal). Host defaults to `127.0.0.1`.
- **`redisClientOptions(url)`** — Returns the node-redis options object: a 1-second `connectTimeout` (fail-fast so a lookup never dominates request latency) and `reconnectStrategy: false as const` (disables node-redis' built-in reconnect loop; each adapter drives its own recovery).
- **`closeRedisClient(client)`** — Gracefully shuts down a client: calls `quit()` (sends QUIT, waits for queued replies); if that rejects, falls back to `destroy()` (drops the socket immediately). Accepts `undefined` and resolves immediately when no client was ever opened.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — Imports all three exports. Uses `redisUrlFromHostPort` for its URL, `redisClientOptions` to build each per-attempt client, and `closeRedisClient` on shutdown. The cache attaches its own silent `error` listener and builds a fresh client on each retry.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Imports the same three exports. Unlike the cache, it keeps a single client across retry attempts (node-redis rejects a racing second `connect()`) and logs connection errors at `error` level.

## Notes

- `reconnectStrategy` is typed as the literal `false` (`false as const`), not a plain `boolean`, because node-redis' socket-options type requires the literal to disable the loop.
- The `undefined` return from `redisUrlFromHostPort` is a deliberate config-absence signal—callers should fall back to a default URL or skip Redis entirely rather than treating it as an empty string.
- This module has **no** `error` listener and **no** retry loop; those live in each consumer to allow the differing degradation strategies.
