---
source: src/modules/account/domain/session-proof.ts
sha256: 0e319ddb87350acd98bb3257fc20366151a1955fcb51d779e238f7c783751a86
generated_at: 2026-10-14T08:39:29.933040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/session-proof.ts

## Purpose

Pure, I/O-free rules for a session's `amr` (Authentication Method Reference) values: what the app mints, how proofs accumulate, and when a first session is denied for lacking a second-factor proof. Exists so that every mint path (login, signup, 2FA confirmation, etc.) shares one source of truth without reaching into I/O.

## Key elements

- **`AMR`** — `as const` object mapping logical names to their wire strings: `password → 'pwd'`, `otp → 'otp'`, `email → 'email'`. The `email` value is app-specific (not RFC-registered); the file explicitly distinguishes it from `otp` (second factor).
- **`withProofs(carried, ...added)`** — Merges existing proof strings with newly-earned ones, returning a de-duplicated array in first-seen order.
- **`firstSessionRefused(armed, amr)`** — Returns `true` only when a second factor is armed **and** the `amr` array does not contain `AMR.otp`. Used to gate the very first mint; re-mints skip this check.

## Relationships

- **`domain/index.ts`** — Re-exports this module so consumers can import from the domain barrel.
- **`session/mint-guard.ts`** — The operational guard that applies `firstSessionRefused` and `withProofs` at mint time; this file supplies the rules, `mint-guard` performs the I/O.
- **Controllers** (`post-login`, `post-signup`, `post-login-2fa`, `post-2fa-confirm`, `post-password-change`, `delete-2fa`, `delete-2fa-method`) — Each is a "mint path" that consumes `AMR` constants and/or `withProofs` when building the session's proof list.
- **`services/reauth.ts`** — Uses the same proof vocabulary when evaluating whether a reauth attempt satisfies the armed-factor requirement.
- **`tests/unit/session-proof.test.ts`** — Direct unit tests for `withProofs` and `firstSessionRefused`.
- **`tests/factories.ts`** — Provides pre-built `amr` arrays (using `AMR` values) for controller/service tests.

## Notes

- `firstSessionRefused` checks **only** for `AMR.otp`. A session that proved identity via `password` or `email` alone will still be refused if a second factor is armed.
- The `email` AMR value is deliberately separate from `otp`; do not treat "mailed code" and "second-factor code" as interchangeable when reading or writing `amr` arrays.
- `withProofs` preserves insertion order (first-seen) but is **not** sorted; downstream consumers must not assume alphabetical order.
