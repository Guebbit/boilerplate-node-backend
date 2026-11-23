---
source: src/modules/account/domain/session-proof.ts
generated_at: 2026-11-22T03:29:07.004675+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/domain/session-proof.ts

## Purpose
Pure, I/O-free rules about what a session's `amr` (authentication methods references, RFC 8176) claims: which values this app mints, how proofs are combined, and when a first session must be refused for lacking a second factor. It exists so every session-mint path shares one definition. The module doc has a `@see` pointer to a "the mint guard" section of an account-sessions doc.

## Key elements
- **`AMR`**: constant map of the claimable values: `password` → `'pwd'`, `otp` → `'otp'`, `email` → `'email'`.
  - `otp` means a verified second-factor code.
  - `email` is this app's own non-registered value for a mailed step-up code. It is not a second factor.
- **`withProofs(carried, ...added)`**: returns the carried proofs plus the added ones. Each proof appears once, in first-seen order (built with a `Set`).
- **`firstSessionRefused(armed, amr)`**: returns a boolean that is `true` when a second factor is armed and `amr` does not include `AMR.otp`.

## Relationships
The listed neighbors are the files that depend on or exercise this module. Their code isn't shown here, so only the following is stated:
- The account controllers (`src/modules/account/controllers/post-login.ts`, `post-login-2fa.ts`, `post-signup.ts`, `post-password-change.ts`, `post-2fa-confirm.ts`, `post-2fa-disable.ts`, `post-2fa-method-remove.ts`), `src/modules/account/services/reauth.ts` and `src/modules/account/session/mint-guard.ts` are neighbors in the dependency graph, consistent with the "every mint path shares it" intent.
- `src/modules/account/domain/index.ts` is a neighbor in the graph, likely as the domain's export surface.
- `src/modules/account/tests/unit/session-proof.test.ts` and `src/modules/account/tests/factories.ts` are the test-side neighbors.

## Notes
- `firstSessionRefused` applies only to a FIRST session. A re-mint continues a session that already passed, so it is never asked this.
- Only `AMR.otp` satisfies the check. `AMR.email` (a mailed code) does not, by design.
- `AMR.password` is `'pwd'`, while its key is `password`. The other two have matching key and value.
- `withProofs` takes `string[]` and `readonly string[]`, not a restricted union of `AMR` values.
