---
source: src/modules/account/two-factor/delivered-code-verify.ts
sha256: 94e7b74286ecfcc23ee8619ed6b35f47b218b89732ef35fcbdc720eeab1052b6
generated_at: 2026-10-14T14:48:07.234143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-code-verify.ts

## Purpose

Single-purpose module that verifies a caller-supplied code against the account's in-flight delivered code and performs the resulting conditional write (spend on match, attempt-count on miss) atomically behind the users service "door," eliminating a read-modify-write race. The same code path serves both the second-factor delivered code and the step-up (reauth) code.

## Key elements

- **`verifyDeliveredCode(user, slot, state, code, now?)`** *(exported)* — The only export. Runs the pure `checkDeliveredCode` comparison, then dispatches:
  - **match** → `userService.spendDeliveredCode(…, hash, MAX_ATTEMPTS, now)`; the resolved boolean is *true* only if this call won the spend (a concurrent duplicate loses).
  - **miss** → `userService.recordDeliveredMiss(…, hash, MAX_ATTEMPTS)`; always resolves `false`.
  - **no state / no hash** → short-circuits to `Promise.resolve(false)`.
- **`now: Date = new Date()`** — injectable clock for deterministic tests.

## Relationships

- **`./delivered-codes`** — imports `checkDeliveredCode` (the pure hash-comparison + expiry check) and `DELIVERED_CODE_MAX_ATTEMPTS` (the attempt budget passed to the users service).
- **`@modules/users` (index)** — imports `userService` (provides `spendDeliveredCode`, `recordDeliveredMiss`) and the types `UserDocument`, `DeliveredCodeSlot`, `DeliveredCodeState`.
- **`@modules/users/services`** — concrete implementations of the two write methods invoked above.
- **`@modules/users/model`** — source of the `DeliveredCodeState` / `DeliveredCodeSlot` / `UserDocument` type shapes used in the signature.
- **`two-factor/methods/email.ts`** — caller on the second-factor path (delivered-code email flow).
- **`account/services/reauth.ts`** — caller on the step-up path (module doc: "the same path serves … the step-up code").
- **`two-factor/index.ts`** — barrel that re-exports this module's public surface.

## Notes

- The function is **idempotent-unfriendly by design**: two parallel requests with the same code both pass the pure check, but only one wins the `spendDeliveredCode` conditional write. The loser's call resolves `false`, so callers should treat `false` as "not spent *by this call*," not necessarily "wrong code."
- `DELIVERED_CODE_MAX_ATTEMPTS` is passed to both the spend and miss calls so the users service can enforce the attempt ceiling in the same write; this file does not do its own attempt arithmetic.
- The module is side-effect-free on the happy path *before* the service call — all branching logic is synchronous; only the service calls are async.
