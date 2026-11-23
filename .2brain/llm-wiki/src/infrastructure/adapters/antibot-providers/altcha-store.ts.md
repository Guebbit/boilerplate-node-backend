---
source: src/infrastructure/adapters/antibot-providers/altcha-store.ts
source_sha256: a2ea6b15c5b04b547cf1ba195e3c0c82cfa9275d681ab55ef9c7e0778478ecc0
context_sha256: a34cab2e54a3d842493566674f4d70646cdead4b22913ae30878c09604896a3a
generated_at: 2026-11-22T02:33:40.026693+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-providers/altcha-store.ts

## Purpose
Single-use record for ALTCHA challenges, so a solved challenge cannot be spent twice. It works in two steps around altcha-lib's `verify`: a read-only peek (`isSpent`) before verification, and a claim (`claim`) only after `verify` returned `verified: true`. Nothing unsigned ever writes, because the id is read from the payload before it is trusted. Otherwise an attacker could fill memory and Redis with random ids.

## Key elements
- `isSpent(id)` — read-only check. Returns `true` if the id is spent in the local map or in Redis. An id longer than 256 characters counts as spent.
- `claim(id)` — records the id atomically. It claims in the local map first (synchronous), then calls Redis `SET NX` with a 600 s TTL. It resolves `true` only for the first caller. An over-long id resolves `false`.
- `spentLocally` — in-process `Map<key, expiresAt>`. It is the floor that still enforces single-use when Redis is absent or failing.
- `sweepExpired()` — drops expired entries and stops at the first live one. This is valid because the Map iterates in insertion order and all records share one TTL.
- `claimLocally` / `spentHere` — local-map helpers. `spentHere` sweeps before checking.
- `keyOf(id)` — namespaces keys as `antibot:spent:<id>`.
- `RECORD_TTL_SECONDS` (600) and `MAX_KEY_LENGTH` (256) — constants.

## Relationships
- `../limits-redis` — supplies `isLimitsKeyClaimed` (used by `isSpent`) and `claimLimitsKey` (used by `claim`). `claim` treats any result other than `'taken'` as success. The `'unavailable'` result (no Redis) therefore leaves the local claim as the answer.
- `altcha.ts` — the ALTCHA provider. By the module's own doc, it calls `isSpent` before `verify` and `claim` after a successful one.
- `tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts` — unit tests that exercise the ALTCHA provider.

## Notes
- Claims are deliberately kept on the `limits` Redis instance, not the cache's. The cache evicts under pressure, and an evicted claim would make a solution replayable.
- The local claim happens synchronously before the async Redis call, so two concurrent requests in one process cannot both win.
- The local map is per process. Redis `SET NX` is what settles the claim across replicas when it is reachable.
- The TTL covers the challenge's own lifetime, after which the challenge has expired anyway.
