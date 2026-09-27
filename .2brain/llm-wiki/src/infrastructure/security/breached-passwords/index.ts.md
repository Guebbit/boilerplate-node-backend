---
source: src/infrastructure/security/breached-passwords/index.ts
sha256: 17708659fdd60662599c798ceb520aef1bf75de81ae48fd5760784f91bcd738a
generated_at: 2026-09-27T14:16:16.189272+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/breached-passwords/index.ts

## Purpose

Provides two independent, fail-open rungs for checking whether a password being **set** (never one being proven at login) appears in known breach corpora: a bundled local list and the HIBP k-anonymity range API. The module exposes a single enforcing entry point (`assertPasswordNotBreached`) and a combined check (`checkPasswordBreach`) that upstream services call before accepting a new or changed password.

## Key elements

- **`bundledList`** (module-private) — `Set<string>` loaded once at import time from `list.txt` in the same directory. Exact, case-sensitive membership test.
- **`isInBundledBreachList(password)`** — Rung 1: synchronous `Set.has` check against the bundled list. No network, no async.
- **`checkHibpRange(password)`** — Rung 2: SHA-1 hashes the password, sends only the 5-char prefix to `api.pwnedpasswords.com/range/{prefix}`, matches the suffix locally. Fails open (returns `{ breached: false }`) on any error, logging a warning. Timeout controlled by `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS` (default 1500 ms).
- **`checkPasswordBreach(password)`** — Combines both rungs. Rung 1 short-circuits on hit; rung 2 is only attempted when the `NODE_PASSWORD_BREACH_HIBP` flag is enabled (default off). Returns `{ breached, count? }`.
- **`assertPasswordNotBreached(password)`** — The enforcing API. Delegates to `checkPasswordBreach`, then maps a positive result to a single `ResponseErrorItem` (i18n key `validation.password-breached`, field `password`). Returns `[]` when acceptable. Never reveals *which* rung matched or the breach count.

## Relationships

- **`@infrastructure/i18n` (index.ts)** — imports `t` to localize the single validation error message.
- **`@infrastructure/adapters/logger.ts`** — imports `logger`; used in the `checkHibpRange` catch path to warn that the lookup failed and the password was accepted.
- **`@infrastructure/runtime/environment.ts`** — imports `environmentFlag` (to gate each rung via `NODE_PASSWORD_BREACH_LIST` and `NODE_PASSWORD_BREACH_HIBP`) and `environmentNumber` (for the HIBP timeout).
- **`@infrastructure/http/response.ts`** — imports the `ResponseErrorItem` type as the return shape of `assertPasswordNotBreached`.
- **Consumers** — `post-password-check.ts` (advisory endpoint; the only caller that reads `count`), and the password-SET paths in `authentication.ts`, `profile.ts`, and `users/service.ts` call `assertPasswordNotBreached`.

## Notes

- **Fail-open by design.** Any HIBP network error, timeout, non-200, or malformed response results in `{ breached: false }`. A breach-service outage must never become a signup outage.
- **Never called on login.** Refusing a login because the password is breached would lock out the legitimate user and confirm the guess to an attacker. Only password-*set* paths invoke this module.
- **`__dirname` over `import.meta.url`.** The file must work under both `tsx` and ts-jest (CommonJS target), where `import.meta` is a syntax error. Same pattern as `i18n/catalog.ts`.
- **Stryker mutation-testing guards.** The `catch` block in `checkHibpRange` is wrapped in `Stryker disable all` / `restore all` to suppress mutations that would break the intentional fail-open behaviour.
- **`count` is advisory-only.** `assertPasswordNotBreached` discards it; only the `post-password-check` advisory endpoint surfaces it to the frontend.
