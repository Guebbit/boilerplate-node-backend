---
source: src/infrastructure/adapters/antibot-providers/altcha-store.ts
sha256: 82900758514265938a2139710424c7e59776bf776ededf8947dcd2aa521a8f1a
generated_at: 2026-09-23T17:37:06.968531+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha-store.ts

## Purpose

Implements the ALTCHA library's `Store` contract to enforce single-use of solved challenges, preventing a solution from being replayed. It records a "spent" flag per challenge key and is backed by the shared Redis cache with an in-process `Map` fallback so that single-use enforcement still holds when Redis is unavailable.

## Key elements

- **`altchaStore`** (exported) — the object ALTCHA's verifier calls. `get(key)` returns `true` if the challenge was already spent; `set(key, value)` records the spend.
- **`spentLocally`** (module-private `Map<string, number>`) — in-process fallback store. Holds a key → expiry-epoch-ms entry so a replay is caught even with no Redis.
- **`RECORD_TTL_SECONDS`** (const, `600`) — how long a spent record lives in cache; aligned with the challenge's own expiry window.
- **`sweepExpired()`** — removes `spentLocally` entries whose TTL has passed, preventing unbounded memory growth in long-lived processes.
- **`keyOf(key)`** — prefixes every key with `antibot:spent:` to avoid collisions with other cache consumers.

## Relationships

- **`altcha.ts`** — consumes `altchaStore` and passes it to the ALTCHA library as the `store` option, so the library calls `get`/`set` around its verification logic.
- **`cache.ts`** — provides `getCacheValue` and `setCacheValue`, the actual Redis round-trips. This file treats those calls as an optimisation layer: if no Redis is configured, the calls silently no-op and `spentLocally` carries the enforcement within a single process.

## Notes

- The local `Map` is a _floor_, not a full replacement: cross-worker replay protection only exists when Redis is reachable (consistent with `rate-limit-store.ts` and `cluster.ts`'s worker-fork model).
- `get` returns `Promise.resolve(true)` on a local hit without touching Redis, but still calls `sweepExpired()` first—so the sweep runs on every read, not on a timer.
- The `set` value is stored as `String(value)` in the cache; `get` only checks for presence (`!== undefined`), so the stored boolean's magnitude is irrelevant.
