---
source: src/modules/account/tests/unit/tokens.test.ts
sha256: 8b7344c5c51b052cde1543f647626d7ddcd621fc7a7d240a21fd7731115f85b9
generated_at: 2026-10-29T03:06:30.710984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the session/token configuration module (`@modules/account/session/config`). Validates that every env-var-driven value (tier expiry times, access-token TTL, signing rings, cookie max-age, session mode, rotation/reuse windows) parses correctly, routes to the right tier, falls back to documented defaults instead of `NaN`/`undefined`, and that the slice's boot gate enforces the correct required keys per session mode.

## Key elements

- **`TOKEN_ENV_KEYS`** — const array of every env var the module reads; passed to `withoutEnvironmentInThisFile` so no ambient value can leak into assertions.
- **`describe('getExpiryTime')`** — verifies per-tier env-var routing, default fallback, empty-string → default (not `NaN`), and base-10 parsing (no octal).
- **`describe('getExpiryTimeMilliseconds')`** — confirms the ×1000 scaling and that it stays a finite number when unset.
- **`describe('token signing rings')`** — checks single-value → length-1 array, comma-split ordering, and unset → `[]` (never `undefined`).
- **`describe('the access-token TTL')`** — asserts `NODE_TOKEN_ACCESS_TIME` is read in isolation, falls back to 600 s, and is *not* influenced by session-tier vars.
- **`describe('getCookieMaxAgeMilliseconds')`** — tier → ms when present; `undefined` (browser-session cookie) when absent.
- **`windowProblems` helper** — calls `sessionConfig.slice.inspect` with a production-shaped env to surface the reuse-vs-grace boot check without a real process.
- **`describe('the token windows check')`** — asserts `reuse > grace` is enforced; equal or smaller values produce the documented error string.
- **`describe('getSessionMode')`** — default `'jwt'`, case/whitespace-insensitive parsing, and throw-on-unknown-mode.
- **`describe('the boot gate for the signing rings')`** — uses `assertConfigIn` to confirm placeholders are rejected in `jwt` mode, ignored in `cookie` mode, and that the reuse-window check is skipped when rotation is absent.

## Relationships

- **`@modules/account/session/config`** (the module under test) — imports all public functions and the `sessionConfig` slice definition.
- **`@infrastructure/config/define`** — imports `assertConfigIn` to exercise the slice's boot-gate validation in isolation.
- **`@types`** — imports `RememberTier` enum used as the tier selector in every expiry assertion.
- **`@tests/environment`** — imports `setEnvironment` (per-test injection) and `withoutEnvironmentInThisFile` (global cleanup registration).

## Notes

- Distinct numeric values are deliberately used per tier (3600 / 86400 / 2592000) so that a wiring swap between tiers would be caught; identical values would mask it.
- The `NODE_TOKEN_ACCESS_TIME` variable is explicitly set to a *different* value in the "no tier given" test to prove the session-tier path does not accidentally read the access-token variable.
- Boot-gate tests construct a full production-shaped env object (including `NODE_TOTP_ENCRYPTION_KEY`, `NODE_DEVICE_COOKIE_SECRET`) so that only the keys under test are the variable factor.
- The file is truncated in this snapshot; the final `describe` block (boot gate, cookie-mode reuse check) is cut off mid-expression but its intent is visible from the setup.
