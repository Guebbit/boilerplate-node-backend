---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 0535ef610b09ede04fb2e0eeccc31f2aa56e03da0a0a07da2add08942e52bec5
generated_at: 2026-11-08T03:48:21.831131+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Two independent, fail-open checks that reject a password **being set** (signup, reset, change) if it appears in a bundled breach list or the HIBP k-anonymity API. Explicitly never used on login, where a rejection would both confirm an attacker's guess and lock out the very user the check is meant to protect.

## Key elements

- **`bundledList`** (module-level `Set<string>`) — loaded once at import time from `shared/rules/breached-passwords.txt`; exact, case-sensitive match.
- **`isInBundledBreachList(password)`** — Rung 1: synchronous `Set.has` lookup. No network, no async.
- **`checkHibpRange(password)`** — Rung 2: SHA-1 the password, send only the 5-char prefix to HIBP's `/range/` endpoint, match the suffix locally. Uses `AbortSignal.timeout`, `redirect: 'error'`, and `Add-Padding: true`. Returns `{ breached, count? }`.
- **`checkPasswordBreach(password)`** — Combined orchestrator: runs Rung 1 first (short-circuits Rung 2 on a hit), then Rung 2 only if the HIBP flag is enabled. Resolves `{ breached, count? }`.
- **`assertPasswordNotBreached(password)`** — The entry point for enforcing call-sites. Wraps `checkPasswordBreach` and maps a positive result to a single `fieldError('password', t('validation.password-breached'))`; empty array otherwise. Never reveals which rung fired.

## Relationships

- **`@infrastructure/security/config`** — reads `NODE_PASSWORD_BREACH_LIST`, `NODE_PASSWORD_BREACH_HIBP`, and `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS` feature flags / timeout.
- **`@infrastructure/config/shared-rules/load`** — provides `SHARED_RULES_DIRECTORY` to locate the bundled `.txt` file.
- **`@infrastructure/http/read-capped-body`** — uses `readCappedText` + `DEFAULT_BODY_CAP_BYTES` to read the HIBP response body with a size cap.
- **`@infrastructure/http/response`** — uses `fieldError` and the `ResponseErrorItem` type to shape the rejection returned by `assertPasswordNotBreached`.
- **`@infrastructure/i18n`** — localises the single error message via `t('validation.password-breached')`.
- **`@infrastructure/adapters/logger`** — logs a `warn` when HIBP is unreachable or malformed (the fail-open path).
- **`src/modules/account/services/signup.ts`**, **`password-reset.ts`**, **`password.ts`** — call-sites that invoke `assertPasswordNotBreached` as a gate before persisting a new password.
- **`src/modules/account/controllers/post-password-check.ts`** — the advisory endpoint; the only consumer that reads the `count` field from `checkPasswordBreach`.
- **`tests/unit/infrastructure/security/breached-passwords/index.test.ts`** — unit tests for all exported functions.

## Notes

- **Fail-open contract.** Any HIBP error (timeout, non-200, malformed body, redirect) resolves to `{ breached: false }` after a `logger.warn`. A breach-service outage must never block signup. The `Stryker disable/restore all` pair around the `catch` suppresses mutation-testing on that intentional fallback.
- **Redirects are errors.** `fetch` is configured with `redirect: 'error'` so a HIBP response that 302s to an unchosen host is treated as a failure, not followed.
- **`count` is advisory-only.** `assertPasswordNotBreached` discards it; only the `post-password-check` endpoint surfaces it to the client.
- **Case-sensitive, exact match.** The bundled list and HIBP suffix comparison are both case-sensitive. This is deliberate: `password1!` and `Password1!` are distinct candidates to breach-tooling.
- **Rung order matters.** Rung 1 is checked before any network call; on a hit, Rung 2 is never reached, keeping the common case fully synchronous.
