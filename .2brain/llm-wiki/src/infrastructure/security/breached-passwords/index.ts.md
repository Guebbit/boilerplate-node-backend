---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 5b45d3a4d4d2797edaf25bac302d77ef9d579ec039dc61282305cbc459a23031
generated_at: 2026-10-15T09:51:03.572929+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Provides breached-password checking exclusively for password **set** paths (signup, change, reset). Two independent rungs — a bundled in-memory list and the HIBP k-anonymity range API — are consulted in order. Both rungs **fail open** (any error accepts the password), and the check is never performed on login, where refusing would confirm a guess to an attacker and lock out the legitimate user.

## Key elements

- **`bundledList`** (module-level `Set<string>`) — loaded once from `list.txt` via `readFileSync` at import time; exact, case-sensitive membership check.
- **`isInBundledBreachList(password)`** — synchronous, zero-network check against `bundledList` (rung 1).
- **`checkHibpRange(password)`** — asynchronous HIBP k-anonymity lookup (rung 2). Sends only the 5-char SHA-1 prefix; matches the suffix locally. Bounded by `AbortSignal.timeout`, capped body read, `redirect: 'error'`, and the `Add-Padding` header. Returns `{ breached, count? }`.
- **`checkPasswordBreach(password)`** — orchestrates both rungs: short-circuits on a rung-1 hit; skips rung 2 if its feature flag is off. The shared primitive behind both the enforcing and advisory callers.
- **`assertPasswordNotBreached(password)`** — the entry point every password-set path calls. Returns `ResponseErrorItem[]` (empty array = accepted). Never reveals *which* rung matched.
- **`parseRangeLine`** (internal) — parses one `SUFFIX:COUNT` line from a HIBP range response.

## Relationships

- **`@infrastructure/security/config`** — reads `breachedPasswordsConfig()` for the two feature flags (`NODE_PASSWORD_BREACH_LIST`, `NODE_PASSWORD_BREACH_HIBP`) and the HIBP timeout (`NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS`).
- **`@infrastructure/http/read-capped-body`** — uses `readCappedText` and `DEFAULT_BODY_CAP_BYTES` to bound the HIBP response body.
- **`@infrastructure/http/response`** — imports `fieldError` and the `ResponseErrorItem` type to build the standard error-shape returned to callers.
- **`@infrastructure/i18n`** — uses `t('validation.password-breached')` for the user-facing error message.
- **`@infrastructure/adapters/logger`** — logs a warning (`logger.warn`) when the HIBP call fails and the password is accepted.
- **`src/modules/account/services/signup.ts`**, **`password-reset.ts`**, **`password.ts`** — call `assertPasswordNotBreached` on their respective password-set paths.
- **`src/modules/account/controllers/post-password-check.ts`** — advisory endpoint; calls `checkPasswordBreach` and is the only caller that reads the `count` field.
- **`tests/unit/infrastructure/security/breached-passwords/index.test.ts`** — unit tests for this module.

## Notes

- **Fail-open contract:** every error path in `checkHibpRange` resolves to `{ breached: false }`. A HIBP outage must never block signup/reset. The `.catch` block is wrapped in `// Stryker disable/restore all` to suppress mutation-testing noise.
- **`__dirname`, not `import.meta.url`:** the file must work under both `tsx` and Jest (ts-jest CommonJS target), where `import.meta` is a syntax error. Same rationale as `i18n/catalog.ts`.
- **Case-sensitive exact match** on the bundled list: `password1!` ≠ `Password1!` (breach corpora distinguish case).
- **`list.txt` is generated** by `scripts/security/refresh-breached-passwords.ts`; it is a static file in the same directory, not fetched at runtime.
- **HIBP privacy:** only the first 5 hex chars of the SHA-1 hash leave the process; `Add-Padding: true` prevents response-size fingerprinting of the prefix.
- **`redirect: 'error'`:** a redirect is treated as a failure rather than followed, to avoid hitting an untrusted host.
