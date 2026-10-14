---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 9c498549c855e1fcbc89eb723e99d0ddf388367af03f8517b375918de5288d0a
generated_at: 2026-10-14T14:34:32.950712+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Provides two-tier breached-password checking for password-**set** paths (signup, reset, change). Rung 1 is a synchronous in-memory lookup against a bundled list of known-breached passwords; rung 2 is an async HIBP k-anonymity range API call for passwords the bundled list misses. Both rungs fail open — any error results in the password being accepted. This module is never invoked on login.

## Key elements

- **`bundledList`** (internal) — a `Set<string>` populated once at import time from `list.txt` (same directory). Exact, case-sensitive match.
- **`isInBundledBreachList(password)`** — synchronous O(1) membership check against `bundledList`. No network, no async.
- **`parseRangeLine(line)`** (internal) — parses a single HIBP range-response line (`<suffix>:<count>`) into `{ suffix, count }` or `undefined`.
- **`checkHibpRange(password)`** — SHA-1 hashes the password, sends only the 5-char prefix to `api.pwnedpasswords.com/range/`, and matches the suffix locally. Uses `AbortSignal.timeout` (configurable) and `redirect: 'error'`. Fails open on any error, logging a warning.
- **`checkPasswordBreach(password)`** — combines both rungs. Rung 1 short-circuits; rung 2 only runs if rung 1 misses **and** `NODE_PASSWORD_BREACH_HIBP` is enabled. Returns `{ breached: boolean; count?: number }`.
- **`assertPasswordNotBreached(password)`** — the enforcing entry point. Calls `checkPasswordBreach` and maps a positive hit to a single `ResponseErrorItem` (generic `VALIDATION_ERROR`, no indication of which rung fired). Empty array when the password is acceptable.

## Relationships

- **`@infrastructure/security/config`** — reads `breachedPasswordsConfig()` for feature flags (`NODE_PASSWORD_BREACH_LIST`, `NODE_PASSWORD_BREACH_HIBP`) and the HIBP timeout.
- **`@infrastructure/i18n`** — calls `t('validation.password-breached')` for the localized rejection message.
- **`@infrastructure/adapters/logger`** — logs a `warn` when the HIBP lookup fails (fail-open path).
- **`@infrastructure/http/read-capped-body`** — uses `readCappedText` / `DEFAULT_BODY_CAP_BYTES` to read the HIBP response body with a size cap.
- **`@infrastructure/http/response`** — imports the `ResponseErrorItem` type to shape the error returned by `assertPasswordNotBreached`.
- **`src/modules/account/services/signup.ts`, `password.ts`, `password-reset.ts`** — call `assertPasswordNotBreached` as a gate before persisting a new password.
- **`src/modules/account/controllers/post-password-check.ts`** — calls `checkPasswordBreach` for the advisory endpoint (the only consumer that reads `count`).
- **`tests/unit/infrastructure/security/breached-passwords/index.test.ts`** — unit tests for this module.

## Notes

- **`__dirname`, not `import.meta.url`**: the file must work under both `tsx` (ESM) and `ts-jest` (CommonJS). `import.meta` is a syntax error under ts-jest's CJS target. Same pattern as `i18n/catalog.ts`.
- **Fail-open is intentional**: the `.catch` block on `checkHibpRange` is annotated with Stryker `disable all` / `restore all` so mutation testing doesn't flag it; the behaviour (log + accept) must never change to a throw.
- **Never on login**: the module docstring explicitly forbids calling these functions during authentication, as refusal would confirm a guess to an attacker and lock out the affected user.
- **Case sensitivity**: the bundled list uses exact `Set` lookup; `Password1!` and `password1!` are distinct entries.
- **`Add-Padding: true`** header: asks HIBP to pad the response body so its size cannot leak information about the prefix queried.
- **Bundled list size**: roughly 20k short strings, a few MB of heap — loaded once, no concern noted.
