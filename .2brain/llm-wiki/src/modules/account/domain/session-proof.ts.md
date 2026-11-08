---
source: src/modules/account/domain/session-proof.ts
sha256: 0e319ddb87350acd98bb3257fc20366151a1955fcb51d779e238f7c783751a86
generated_at: 2026-11-08T04:09:25.021506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/session-proof.ts

## Purpose

Pure, side-effect-free rules for the `amr` (Authentication Methods Reference) field on a session token. It defines which proof values this app mints, how to merge proofs across re-mints, and when a **first** session must be refused because a second factor is armed but unproved. Every mint path (login, signup, password change, 2FA flows) imports from here so the logic lives in one place.

## Key elements

- **`AMR`** – Read-only object mapping proof names to their RFC 8176-style token strings: `password → 'pwd'`, `otp → 'otp'`, `email → 'email'`. `email` is app-specific (a mailed step-up code is *not* a second factor, so it is distinct from `otp`).
- **`withProofs(carried, ...added)`** – Merges the proofs a session already carries with newly earned proofs. Returns a deduplicated array preserving first-seen order (backed by `Set`).
- **`firstSessionRefused(armed, amr)`** – Returns `true` when the account has a second factor armed **and** the proof list lacks `AMR.otp`. Intended only for first-mint decisions; re-mints skip this check.

## Relationships

- **`domain/index.ts`** – Barrel file that re-exports `AMR`, `withProofs`, and `firstSessionRefused` so controllers and services import from the module root.
- **`session/mint-guard.ts`** – The higher-level mint guard that composes these pure predicates into a decision on whether to issue a session token (the module doc points here for context).
- **Controllers** (`post-login.ts`, `post-login-2fa.ts`, `post-signup.ts`, `post-password-change.ts`, `post-2fa-confirm.ts`, `post-2fa-disable.ts`, `post-2fa-method-remove.ts`) – Each calls `withProofs` to accumulate proofs during its flow and consults `firstSessionRefused` (or the guard that wraps it) before minting.
- **`services/reauth.ts`** – Re-authentication path; uses the same proof values and refusal rule when deciding whether a re-mint is allowed.
- **`tests/unit/session-proof.test.ts`** – Unit tests exercising `withProofs` ordering/dedup and `firstSessionRefused` truth table.
- **`tests/factories.ts`** – Provides shared fixtures (armed-account, sample `amr` arrays) used by the test above and by controller tests.

## Notes

- `AMR.email` is **not** an RFC-registered value; it exists because a mailed step-up code is semantically different from a TOTP/WebAuthn second factor (`otp`). Code that checks "did the user prove a second factor?" must look for `AMR.otp`, not `AMR.email`.
- `firstSessionRefused` is deliberately narrow: it only checks for `AMR.otp`. If the app later adds other required factors, this predicate (or a caller) must be updated.
- `withProofs` relies on `Set` iteration order (insertion order per spec). Do not replace with `Array.from(new Set(...))` if order matters—current behaviour is "first seen wins."
- The module has zero imports; it is safe to use in any context, including workers or edge functions.
