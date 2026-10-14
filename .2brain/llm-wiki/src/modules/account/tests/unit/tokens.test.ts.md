---
source: src/modules/account/tests/unit/tokens.test.ts
sha256: 9cf329613da4244171fc2a658986b1d91f89d28005005173283aea84bc7c3a14
generated_at: 2026-10-14T14:46:52.101264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the token/session configuration module (`session/config.ts`). Every value under test controls a JWT lifetime, signing secret, or cookie max-age — misreads produce silently too-long (security) or too-short (support) sessions with no runtime error. The tests pin the documented contract: per-tier env-var routing, fallback defaults, ring parsing, mode selection, and the boot-gate rules.

## Key elements

- **`TOKEN_ENV_KEYS`** — const array of every env var the module reads; passed to `withoutEnvironmentInThisFile` so each test starts with a clean slate.
- **`setEnvironment`** / **`withoutEnvironmentInThisFile`** — test helpers (from `tests/support/environment`) that set or clear process env vars per test.
- **`windowProblems(grace?, reuse?)`** — local helper that calls `sessionConfig.slice.inspect` with a production-shaped object to exercise the grace-vs-reuse boot check and return the list of problem messages.
- **`placeholders`** (inside the boot-gate `describe`) — a production-shaped config object with deliberately placeholder secrets, used to assert that `assertConfigIn` rejects them in `jwt` mode but accepts their absence in `cookie` mode.
- **`describe` blocks** — one per exported function/behaviour: `getExpiryTime`, `getExpiryTimeMilliseconds`, signing rings, access-token TTL, `getCookieMaxAgeMilliseconds`, `toRememberTier`, the token-windows check, `getSessionMode`, and the boot gate for signing rings.

## Relationships

- **`src/modules/account/session/config.ts`** — the module under test. All SUT imports (`getExpiryTime`, `getAccessTokenRing`, `sessionConfig`, etc.) come from here.
- **`src/infrastructure/config/define.ts`** — supplies `assertConfigIn`, used in the boot-gate tests to verify that `sessionConfig.slice` rejects placeholder secrets or missing required keys.
- **`tests/support/environment.ts`** — supplies `setEnvironment` and `withoutEnvironmentInThisFile`, the env-var isolation utilities every test in this file depends on.

## Notes

- Every test sets **distinct** numeric values per tier so that a swapped mapping (e.g. SHORT and MEDIUM both reading the same var) cannot be masked by identical assertions.
- Empty-string and unset env vars are tested separately; both must resolve to the tier default, never `NaN` (a `NaN` max-age would be silently dropped by Express, producing an unintended session cookie).
- The boot-gate tests set `NODE_ENV: 'production'` explicitly to exercise the production enforcement path (the gate skips enforcement in test mode).
- `cookie` mode exempts the signing-ring requirement and the reuse-window check entirely — a non-obvious coupling between `NODE_SESSION_MODE` and which keys are mandatory.
- The `getSessionMode` test uses `it.each` with a whitespace-padded value (`'  Cookie '`) to lock in the trim-and-lowercase behaviour.
