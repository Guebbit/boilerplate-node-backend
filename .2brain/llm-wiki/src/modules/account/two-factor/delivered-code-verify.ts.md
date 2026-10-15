---
source: src/modules/account/two-factor/delivered-code-verify.ts
sha256: b2c7a29015a931bcbdcece34ee3cde28d57f69bdd889eecfe1375cb9f63d7c63
generated_at: 2026-10-15T10:16:41.084885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-code-verify.ts

## Purpose

Verifies a delivered (e.g. emailed) code against an account using a pure comparison followed by conditional writes. It avoids a read-modify-write cycle: the comparison itself (`checkDeliveredCode`) is stateless, and the side-effects (spending the code on a match, incrementing the miss counter on a failure) are issued as separate conditional writes through the users service. The same function serves both a second-factor code and a step-up (reauth) code.

## Key elements

- **`verifyDeliveredCode(user, slot, state, code)`** *(exported)* — The sole export. Returns `Promise<boolean>` indicating whether *this* call spent the code.
  - Resolves `false` immediately if `state` or `state.codeHash` is absent.
  - On a **match** verdict: delegates to `userService.spendDeliveredCode` with the hash as the CAS guard.
  - On a **miss** verdict: delegates to `userService.recordDeliveredMiss`, then resolves `false`.
  - Any other verdict (e.g. expired) resolves `false` with no write.

## Relationships

- **`./delivered-codes`** — Imports the pure comparator `checkDeliveredCode` and the constant `DELIVERED_CODE_MAX_ATTEMPTS`.
- **`@modules/users`** (index, model, services) — Imports the `userService` instance and the `UserDocument`, `DeliveredCodeSlot`, and `DeliveredCodeState` types. All writes (`spendDeliveredCode`, `recordDeliveredMiss`) go through `userService`, keeping the "users door" as the sole mutation boundary.
- **`./index.ts`** — Barrel file that re-exports this module for consumers within the two-factor module.
- **`./methods/email.ts`** — The email second-factor method that calls `verifyDeliveredCode` when a user submits their emailed digits.
- **`../services/reauth.ts`** — The step-up/reauth flow that reuses this same verification path for the step-up code.

## Notes

- **Idempotent-spend guarantee:** The `hash` parameter acts as a compare-and-set guard on the write. A parallel request holding the same code will fail the spend, so a code can only be consumed once regardless of concurrency.
- **No direct collection writes:** This module never touches a datastore itself; all mutations are conditional writes mediated by `userService`.
- **Single code path for two contexts:** Both 2FA second-factor verification and step-up (reauth) verification funnel through this one function — there is no separate "reauth verify" implementation.
