---
source: src/modules/account/tests/unit/tokens.test.ts
sha256: 8b7344c5c51b052cde1543f647626d7ddcd621fc7a7d240a21fd7731115f85b9
generated_at: 2026-11-08T04:50:40.411618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the session/token configuration module (`session/config.ts`). Every value in that module controls a JWT lifetime, cookie `maxAge`, or signing secret — misreads cause silent security or availability bugs rather than request failures. The tests pin the documented contract: per-tier env-var routing, integer parsing with safe fallbacks, ring shape invariants, and the boot-gate validation logic.

## Key elements

- **`TOKEN_ENV_KEYS`** — const list of every env var the module reads; passed to `withoutEnvironmentInThisFile` so no ambient value can leak into assertions.
- **`describe('getExpiryTime')`** — verifies per-tier var routing, default-tier fallback, empty-string → tier-default (not NaN), and base-10 parsing.
- **`describe('getExpiryTimeMilliseconds')`** — confirms the ×1000 scaling and same tier routing; asserts a finite number (not NaN) on unset to prevent silent cookie loss.
- **`describe('token signing rings')`** — single-secret → one-element array, comma-split → ordered ring, unset → `[]` (never `undefined`).
- **`describe('the access-token TTL')`** — reads `NODE_TOKEN_ACCESS_TIME`, falls back to 600 s, empty string → default, and explicitly ignores session-tier vars.
- **`describe('getCookieMaxAgeMilliseconds')`** — tier → ms; no tier → `undefined` (browser-session cookie).
- **`windowProblems` helper** — calls `sessionConfig.slice.inspect` with a production-shaped env to exercise the reuse-window > grace-window invariant.
- **`describe('the token windows check')`** — passes when reuse > grace, fails on equality (strict `>`), fails when reversed.
- **`describe('getSessionMode')`** — defaults to `'jwt'`, trims/case-insensitive parsing, throws on unknown values.
- **`describe('the boot gate for the signing rings')`** — uses `assertConfigIn` with `sessionConfig.slice` to verify: placeholders rejected in JWT mode, cookie mode exempt from ring and reuse-window requirements, mode selector read with same trim/case logic.

## Relationships

- **`src/modules/account/session/config.ts`** — the module under test; all functions under assertion (`getExpiryTime`, `getExpiryTimeMilliseconds`, `getAccessExpiryTime`, `getCookieMaxAgeMilliseconds`, `getAccessTokenRing`, `getRefreshTokenRing`, `getSessionMode`, `sessionConfig`) are imported from here.
- **`src/infrastructure/config/define.ts`** — provides `assertConfigIn`, the boot-gate assertion helper used to validate the slice's required-key and conditional-requirement rules.
- **`src/types/index.ts`** — source of the `RememberTier` enum used to parameterise tier-specific assertions.
- **`tests/support/environment.ts`** — provides `setEnvironment` (per-test env mutation) and `withoutEnvironmentInThisFile` (auto-delete of `TOKEN_ENV_KEYS` before/after each test) for hermetic execution.

## Notes

- The file relies on `withoutEnvironmentInThisFile` to clear **all** token-related vars before every test; a missing key in `TOKEN_ENV_KEYS` would let an ambient value silently satisfy an assertion.
- Empty-string → tier-default is tested explicitly in several suites: `parseInt('')` yields `NaN`, which would propagate into `expiresIn` (rejected by jose) or `maxAge` (silently dropped by Express). The contract is "unparseable ≡ absent".
- The window check uses **strict** `reuse > grace` (not `>=`). The tests assert that equal values are rejected because a token superseded exactly `grace` ms ago is already expired by both cutoffs simultaneously — there is no instant where a replay is distinguishable from normal expiry.
- The boot-gate tests construct a `placeholders` object that is production-shaped for all *other* keys so that only the ring / mode interaction is under observation.
- The file is truncated in the provided content; the final `describe` block for the boot gate (cookie-mode exemption from the reuse-window check) is incomplete.
