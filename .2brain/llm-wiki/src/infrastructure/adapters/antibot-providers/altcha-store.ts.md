---
source: src/infrastructure/adapters/antibot-providers/altcha-store.ts
sha256: 881f8dd551ce8b75c15f9c996f639200e8862330d92773b0cb8ba7b1995147e3
generated_at: 2026-09-27T14:04:00.201052+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha-store.ts

## Purpose

Implements the ALTCHA library's `Store` interface to enforce single-use of solved challenge tokens. Ensures one solution cannot be replayed across requests or worker processes by recording each spent challenge id in a shared cache with a local in-memory fallback.

## Key elements

- **`altchaStore`** (exported) — Object conforming to ALTCHA's `Store` contract (`get` + `set`). `get` performs the actual claim (local + Redis `SET NX`) and returns a boolean indicating "already used". `set` is an intentional no-op because claiming happens during `get`.
- **`claimLocally`** — Synchronously checks/inserts into the in-process `spentLocally` Map; returns whether this call was first.
- **`sweepExpired`** — Prunes Map entries past their TTL to prevent unbounded growth in long-lived processes.
- **`keyOf`** — Prefixes keys with `antibot:spent:` to namespace them in the shared cache.
- **`RECORD_TTL_SECONDS`** (`600`) — How long a spent record lives; aligned with the challenge's own expiry window.
- **`MAX_KEY_LENGTH`** (`256`) — Rejects (returns "used" for) keys longer than this, since the id is read from unverified attacker-controlled input.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — Imports `claimCacheKey`, which performs the Redis `SET NX` half of the single-use check. When Redis is unreachable it returns `'unavailable'`, and the local Map claim becomes the authoritative answer.
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** — The ALTCHA provider that receives this `altchaStore` as its `Store` implementation, wiring the library's `get`/`set` calls into this module.

## Notes

- **`set` does nothing.** The claiming logic is entirely in `get`. This is deliberate: two concurrent requests with the same solution could both pass a read-only `get` before either `set` runs. By having `get` perform the atomic claim (local check → Redis `SET NX`), the first caller wins regardless of interleaving.
- **Local Map is a floor, not a ceiling.** The codebase convention (stated in comments) is that `cache.ts` is "an optimisation, never a dependency" — it no-ops without Redis. The `spentLocally` Map guarantees single-use within one process even when Redis is down, matching the same fallback pattern used by `rate-limit-store.ts`.
- **Memory safety.** `sweepExpired` runs on every `claimLocally` call; without it a long-lived worker would leak one Map entry per ever-seen challenge id.
- **Key-length guard returns "used" (`true`).** A key over 256 chars is treated as already-spent, effectively rejecting the challenge without storing anything.
