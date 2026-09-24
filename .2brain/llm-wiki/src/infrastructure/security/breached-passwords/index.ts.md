---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 0941ceaa95557de45eedd10dcf39e50dfa905fd38eb5f1af5759e55e6a8311d2
generated_at: 2026-09-23T17:52:42.833645+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Provides two independent checks that reject a password **being set** (never one being proven at login) against known-breached passwords. Rung 1 is a bundled text list loaded at import time; Rung 2 queries the HIBP k-anonymity range API for passwords the bundled list misses. Both rungs fail open — any error accepts the password so a breach-check outage can never block sign-up.

## Key elements

- **`isInBundledBreachList(password: string): boolean`** — Synchronous exact-match (case-sensitive) lookup against the `list.txt` Set loaded at module scope. No network, no async.
- **`checkHibpRange(password: string): Promise<{ breached: boolean; count?: number }>`** — Asynchronous HIBP range lookup. Sends only the 5-char SHA-1 prefix; matches the 35-char suffix locally. Uses `AbortSignal.timeout` (default 1 500 ms, configurable via `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS`). Fails open with a `logger.warn` on any error.
- **`checkPasswordBreach(password: string): Promise<{ breached: boolean; count?: number }>`** — Combined primitive: runs rung 1 first (short-circuits on hit), then rung 2 only if enabled. Shared by both the enforcing and advisory call sites. The only function that surfaces `count`.
- **`assertPasswordNotBreached(password: string): Promise<ResponseErrorItem[]>`** — The entry point for every password-SET path. Returns an empty array on success or a single `VALIDATION_ERROR` item (i18n key `account.signup.password-breached`) on breach. Deliberately never reveals _which_ rung matched.

## Relationships

- **`@infrastructure/i18n` (index.ts / context.ts)** — `t()` provides the localized error message in `assertPasswordNotBreached`.
- **`@infrastructure/adapters/logger.ts`** — `logger.warn` in the `checkHibpRange` catch block records the fail-open event.
- **`@infrastructure/runtime/environment.ts`** — `environmentFlag('NODE_PASSWORD_BREACH_LIST', true)` gates rung 1; `environmentFlag('NODE_PASSWORD_BREACH_HIBP', false)` gates rung 2 (off by default); `environmentNumber` supplies the HIBP timeout.
- **`@infrastructure/http/response.ts`** — `ResponseErrorItem` type shapes the return value of `assertPasswordNotBreached`.
- **`src/modules/account/controllers/post-password-check.ts`** — Advisory endpoint; calls `checkPasswordBreach` and reads `count` to surface a strength hint (non-enforcing).
- **`src/modules/account/services/authentication.ts`**, **`src/modules/account/services/profile.ts`** — Password-set paths that call `assertPasswordNotBreached` as a validation gate.
- **`tests/unit/infrastructure/security/breached-passwords/index.test.ts`** — Unit tests for both rungs and the combined check.

## Notes

- **`__dirname`, not `import.meta.url`** — Required for ts-jest's CommonJS target (same rationale as `i18n/catalog.ts`). Do not "modernise" to `import.meta`.
- **Never on the login path** — The module doc and every public function's JSDoc explicitly state this; calling `assertPasswordNotBreached` in a login flow would confirm a guess to an attacker and lock out the legitimate user.
- **Rung 2 is off by default** (`NODE_PASSWORD_BREACH_HIBP` defaults to `false`). Only deployments that explicitly enable it hit the network.
- **`list.txt` is a build artifact** produced by `scripts/ops/refresh-breached-passwords.ts`; it lives alongside this file (same `__dirname`).
- **Stryker suppression** around the `logger.warn` + `return { breached: false }` block prevents mutation testing from flagging the intentional fail-open return.
