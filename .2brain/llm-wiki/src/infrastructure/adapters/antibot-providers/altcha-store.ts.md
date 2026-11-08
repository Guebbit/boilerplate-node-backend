---
source: src/infrastructure/adapters/antibot-providers/altcha-store.ts
sha256: 3281d646a7166dd3b88361e47bfc167de27ec149ccfa241594bb59f940e44834
generated_at: 2026-11-08T03:16:30.098749+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha-store.ts

## Purpose

Enforces single-use of ALTCHA challenge IDs so a solved challenge cannot be replayed. It wraps the verify step with a two-phase check—`isSpent` (peek, no write) before verification, `claim` (record) only after a successful `verify`—using an in-process Map as a synchronous floor and Redis as a cross-worker authority.

## Key elements

- **`isSpent(id: string): Promise<boolean>`** — Read-only lookup. Rejects over-long IDs outright. Checks the local Map first, then Redis. Leaves no trace.
- **`claim(id: string): Promise<boolean>`** — Records an ID as used. Tries the local Map synchronously (prevents two in-process requests from both winning), then `SET NX` in Redis. Returns `true` only for the first caller.
- **`spentLocally: Map<string, number>`** — In-process store keyed by namespaced ID with an expiry timestamp. Serves as the no-Redis fallback so single-use still holds within one worker.
- **`sweepExpired()`** — Iterates the Map in insertion order and deletes entries past their TTL; stops at the first live entry (all share one TTL). Amortised O(1) per call.
- **`RECORD_TTL_SECONDS = 600`** — Lifetime of a spent record; intentionally shorter than the challenge's own expiry.
- **`MAX_KEY_LENGTH = 256`** — Cap on the raw challenge ID; prevents an attacker from stuffing memory/Redis with arbitrarily long unsigned strings.
- **`keyOf(key)`** — Prepends `antibot:spent:` to namespace keys in the shared Redis.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** — The ALTCHA provider that calls `isSpent` before running `altcha-lib`'s `verify` and `claim` after a `verified: true` result. This file is the anti-replay guard it delegates to.
- **`src/infrastructure/adapters/limits-redis.ts`** — Supplies `isLimitsKeyClaimed` (Redis GET) and `claimLimitsKey` (Redis `SET NX` with TTL). This file relies on that module's shared `limits` Redis connection rather than the general cache, because cache eviction would make a spent record replayable.
- **`tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts`** — Exercises the provider end-to-end, which exercises `isSpent`/`claim` for happy-path and replay scenarios.

## Notes

- `claim` is **synchronous** in its local step: `claimLocally` runs before any `await`, so two concurrent requests in the same process are serialised by the Map's `set`—the first wins, the second gets `false` immediately.
- When Redis is unavailable, `claimLimitsKey` resolves with `'unavailable'`; `claim` treats that as a successful local-only claim (`result !== 'taken'` is `true`), so single-use degrades gracefully to per-process.
- Insertion order in `spentLocally` is load-bearing: because every record shares one TTL, the first entry that is *not* expired means every subsequent entry is also not expired, so `sweepExpired` can bail early.
- The ID is read from the **unsigned** payload before verification; `MAX_KEY_LENGTH` is the only guard against an attacker choosing pathological IDs. Do not remove it without an equivalent bound.
