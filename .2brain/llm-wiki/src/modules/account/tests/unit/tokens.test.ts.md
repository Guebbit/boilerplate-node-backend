---
source: src/modules/account/tests/unit/tokens.test.ts
sha256: 93e8972037bd5f1f67cfc9eb909880d7597c47648e32095527e0a461159b6e03
generated_at: 2026-10-15T10:16:29.697376+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose
Unit tests for the token/session configuration module (`session/config.ts`). They verify that every env-var read produces the correct parsed value (seconds, milliseconds, ring array, session mode) and that the boot-gate checks (`assertConfigIn`) enforce the documented contract—especially the invariant that `NODE_TOKEN_REUSE_WINDOW_MS` must exceed `NODE_TOKEN_ROTATION_GRACE_MS` and that signing-ring placeholders are rejected in `jwt` mode but optional in `cookie` mode.

## Key elements
- **`TOKEN_ENV_KEYS`** — the full list of env vars the module reads; cleared before every test via `withoutEnvironmentInThisFile` to prevent ambient leakage.
- **`getExpiryTime` / `getExpiryTimeMilliseconds` tests** — tier routing (SHORT/MEDIUM/LONG), default fallback, empty-string → default (not NaN), base-10 parsing, and the ×1000 scaling.
- **Token signing rings tests** — single-secret ring, comma-separated multi-ring (newest first), and the `[]` (never `undefined`) contract when unset.
- **Access-token TTL tests** — `NODE_TOKEN_ACCESS_TIME` parsing, 600 s default, isolation from refresh-tier variables.
- **`getCookieMaxAgeMilliseconds` / `toRememberTier` tests** — tier → ms mapping and the `undefined` sentinel for browser-session cookies.
- **`windowProblems` helper** — invokes `sessionConfig.slice.inspect` to exercise the grace/reuse boot check in production shape.
- **Boot-gate tests** — `assertConfigIn` against placeholder secrets in `jwt` vs `cookie` mode, trimmed/case-insensitive mode selector, and the exemption of the reuse-window check under `cookie` mode.

## Relationships
- **`src/modules/account/session/config.ts`** — the module under test; every `describe` block exercises one or more of its exported functions (`getExpiryTime`, `getAccessExpiryTime`, `getAccessTokenRing`, `getSessionMode`, `sessionConfig`, etc.).
- **`src/infrastructure/config/define.ts`** — provides `assertConfigIn`, which the boot-gate tests call to confirm that the slice's field-level validation (placeholder rejection, mode-conditional requirements) fires correctly.
- **`tests/support/environment.ts`** — supplies `setEnvironment` (inject a single var for a test) and `withoutEnvironmentInThisFile` (delete a set of vars before each test), making every assertion hermetic.

## Notes
- `withoutEnvironmentInThisFile(TOKEN_ENV_KEYS)` is called at module top-level (outside any `describe`), so the clear runs once before the suite; individual tests then call `setEnvironment` to re-inject specific values.
- The file intentionally sets *distinct* values per tier in the "distinct env var per tier" test to catch a swapped-map wiring bug that identical values would mask.
- The `windowProblems` helper hard-codes `NODE_ENV: 'production'` so the boot check runs in its strictest form; the "documented defaults" case (`10 s` grace, `24 h` reuse) is the one combination that passes with no vars set.
- Boot-gate placeholder strings (`your-access-token-secret-here`, `your-refresh-token-secret-here`) are the exact sentinel values the production `.env.example` ships; the tests assert the gate rejects *those specific strings*, not just any short value.
