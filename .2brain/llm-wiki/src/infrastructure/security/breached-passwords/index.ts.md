---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 71178da66712cb07ccf622a97402e6704b3f7fb67f870de8b61875b45c635264
generated_at: 2026-11-14T18:18:28.427499+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Provides breached-password rejection for password **set** paths (signup, reset, change). Two independent rungs—a bundled list checked synchronously and the HIBP k-anonymity range API—both fail open so a breach-service outage never blocks account creation. Explicitly never invoked on login, where rejection would lock out the target user and confirm a guess to an attacker.

## Key elements

- **`bundledList`** (module-level `Set`) — loaded once at import from `shared/rules/breached-passwords.txt`; case-sensitive exact-match set of ~20 k previously-breached passwords.
- **`isInBundledBreachList(password)`** — synchronous `Set.has` check (rung 1).
- **`parseRangeLine(line)`** — splits a HIBP range-response line into `{ suffix, count }`; returns `undefined` for malformed lines.
- **`checkHibpRange(password)`** — SHA-1 hashes the password, sends only the 5-hex prefix to `api.pwnedpasswords.com/range/…` with `Add-Padding: true`, matches the suffix locally, and returns `{ breached, count? }`. Fails open on any error (timeout, non-200, malformed body), logging a warning.
- **`checkPasswordBreach(password)`** — orchestrates both rungs in order (bundled → HIBP), gated by `breachedPasswordsConfig()` flags. Short-circuits on a rung-1 hit.
- **`assertPasswordNotBreached(password)`** — public entry point for password-set services; returns `ResponseErrorItem[]` (empty = acceptable, one `fieldError('password', …)` = breached). Never reveals which rung fired.

## Relationships

- **`src/infrastructure/security/config.ts`** — reads `NODE_PASSWORD_BREACH_LIST`, `NODE_PASSWORD_BREACH_HIBP`, and `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS` feature flags / timeout.
- **`src/infrastructure/config/shared-rules/load.ts`** — supplies `SHARED_RULES_DIRECTORY` to locate the bundled `.txt` file.
- **`src/infrastructure/http/read-capped-body.ts`** — `readCappedText` / `DEFAULT_BODY_CAP_BYTES` bound the HIBP response body size.
- **`src/infrastructure/http/response.ts`** — `fieldError` and `ResponseErrorItem` shape the error returned to callers.
- **`src/infrastructure/i18n/index.ts`** — `t` localises the "password breached" validation message.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used to `warn` on HIBP lookup failure.
- **`src/modules/account/services/signup.ts`**, **`password-reset.ts`**, **`password.ts`** — call `assertPasswordNotBreached` as part of their password-set flow.
- **`src/modules/account/controllers/post-password-check.ts`** — the advisory endpoint; calls `checkPasswordBreach` directly and is the only caller that reads the `count` field.
- **`tests/unit/infrastructure/security/breached-passwords/index.test.ts`** — unit tests for this module.

## Notes

- **Fail-open by design.** Both rungs return "not breached" on any error; the HIBP catch block is wrapped in `Stryker disable/restore all` to suppress mutation-testing noise on the intentional no-op.
- **Padding lines are real data, not errors.** HIBP `Add-Padding` inserts fake entries with `count: 0`; the code discards them by requiring `count > 0`.
- **Redirects are treated as errors** (`redirect: 'error'`) so the request can never be silently forwarded to an untrusted host.
- **Case-sensitive exact match** on the bundled list—`password1!` ≠ `Password1!`—matching how breach corpora and attacker tooling treat candidates.
- The bundled `.txt` is kept **byte-identical to a PHP twin**; the `scripts/security/refresh-breached-passwords.ts` script regenerates it.
- The `count` field on the HIBP result is only consumed by the advisory controller; `assertPasswordNotBreached` discards it.
