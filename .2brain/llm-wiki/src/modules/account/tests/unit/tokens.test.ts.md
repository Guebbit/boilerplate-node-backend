---
source: src/modules/account/tests/unit/tokens.test.ts
sha256: b002fa77622936fb30f7cedabf981b1a0be1af6b877f0628248663315c2d5160
generated_at: 2026-09-23T18:17:37.547569+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the token-configuration module (`session/config.ts`). They verify that every env-var-backed setting—JWT lifetimes, signing-secret rings, and the grace/reuse-window boot check—parses correctly, falls back to safe defaults, and never yields `NaN` or `undefined` in a way that would silently produce broken sessions.

## Key elements

- **`TOKEN_ENV_KEYS`** — exhaustive list of the eight env vars the config module reads; used to wipe/restore the environment around each test.
- **`beforeEach` / `afterEach`** — snapshot and delete all token env vars before a test; restore (or re-delete) them after, so ambient or setup-file values can never leak into assertions.
- **`describe('getExpiryTime')`** — asserts per-tier env-var routing (SHORT/MEDIUM/LONG), the no-arg fallback to `NODE_TOKEN_ACCESS_TIME`, per-tier numeric defaults, empty-string → default (not `NaN`), and base-10 parsing.
- **`describe('getExpiryTimeMilliseconds')`** — confirms the ×1000 scaling, same tier routing, and a finite number when unset.
- **`describe('token signing rings')`** — single-secret → `['secret']`, comma-split → ordered array (newest first), unset → `['']` (never `undefined`).
- **`describe('the access-token TTL')`** — access token reads only `NODE_TOKEN_ACCESS_TIME`, defaults to 600 s, and never inherits a refresh-tier variable.
- **`describe('invalidTokenWindows')`** — boot-check: reuse window must strictly exceed grace window; equal or shorter produces a specific error string.

## Relationships

- **`src/modules/account/session/config.ts`** — sole SUT. This file imports `RefreshTokenExpiryTime`, `getExpiryTime`, `getExpiryTimeMilliseconds`, `getAccessTokenRing`, `getRefreshTokenRing`, and `invalidTokenWindows`, and exercises each under controlled env-var conditions.

## Notes

- Tier tests intentionally assign **distinct** numeric values (3600 / 86400 / 2592000) so a swapped map entry would be caught; identical values would mask the bug.
- The empty-string signing-ring default (`['']`) is asserted explicitly because `jsonwebtoken` throws on `undefined` but accepts `''`—the test pins the documented shape.
- `Number.parseInt('')` → `NaN` is the specific hazard the "empty variable" test guards against; the same concern applies to the millisecond variant (a `NaN` `maxAge` on a cookie is silently dropped by Express).
- The `invalidTokenWindows` equal-case test documents _why_ strict inequality is required: a token superseded exactly `grace` ms ago is already expired, so no replay can ever be distinguished.
