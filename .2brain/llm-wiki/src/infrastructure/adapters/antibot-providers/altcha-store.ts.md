---
source: src/infrastructure/adapters/antibot-providers/altcha-store.ts
sha256: 3281d646a7166dd3b88361e47bfc167de27ec149ccfa241594bb59f940e44834
generated_at: 2026-10-14T07:40:30.703043+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha-store.ts

## Purpose

Enforces single-use semantics on ALTCHA challenge solutions so that one verified payload cannot be replayed. It sits between the caller and `altcha-lib`'s `verify` as a two-step guard: a read-only `isSpent` check before verification (so an unverified payload leaves no trace) and a `claim` write after verification succeeds (so only an accepted solution is recorded).

## Key elements

- **`isSpent(id)`** *(exported)* — Read-only check. Returns `true` if the id is already in the local map, in Redis, or is over `MAX_KEY_LENGTH`. Never mutates state.
- **`claim(id)`** *(exported)* — Records the id as used. Writes the local map first (synchronous, in-process atomicity) then issues a Redis `SET NX` via `claimLimitsKey`. Returns `true` only for the first caller.
- **`spentLocally`** *(module-private Map)* — In-process floor for single-use tracking. Lives on the `limits` Redis instance, not the cache, because cache eviction would make a solution replayable.
- **`sweepExpired()`** *(module-private)* — Deletes expired entries from `spentLocally`. Exploits the fact that all records share one TTL and the Map iterates in insertion order, so it stops at the first live entry (amortised O(1)).
- **`keyOf(key)`** *(module-private)* — Prepends the `antibot:spent:` namespace to prevent key collisions with other consumers of the same Redis store.
- **`RECORD_TTL_SECONDS`** — 600 s; the lifetime of a spent record (chosen to cover the challenge's own expiry window).
- **`MAX_KEY_LENGTH`** — 256 chars; ids longer than this are rejected/treated as spent to bound memory and Redis writes from hostile payloads.

## Relationships

- **`altcha.ts`** — The ALTCHA provider that calls `isSpent` before and `claim` after `verify`, orchestrating the two-step protocol documented in this file's module comment.
- **`limits-redis.ts`** — Supplies `isLimitsKeyClaimed` and `claimLimitsKey`, the Redis-backed cross-worker half of the single-use check. This file deliberately reuses the *limits* instance rather than the cache instance.
- **`altcha.test.ts`** — Unit tests for the ALTCHA provider; exercises `isSpent`/`claim` through the provider's public surface.

## Notes

- **Order matters.** Call `isSpent` → `verify` → `claim`. Calling `claim` before `verify` would let an attacker fill memory/Redis with random ids from unsigned payloads.
- **Local map is a floor, not the full story.** Without Redis (or if it fails), single-use is still enforced within one process. Redis extends that guarantee across `cluster.ts` worker forks. The two layers are independent; a local hit short-circuits before any Redis call.
- **`unavailable` from Redis is not an error.** `claim` treats it as "local claim stands," preserving the in-process guarantee.
- **Insertion order = expiry order.** Because every record has the same TTL, `sweepExpired` can stop at the first live entry. Do not give records different TTLs without revisiting that assumption.
