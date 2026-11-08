---
source: src/modules/account/two-factor/delivered-code-verify.ts
sha256: b2c7a29015a931bcbdcece34ee3cde28d57f69bdd889eecfe1375cb9f63d7c63
generated_at: 2026-11-08T04:51:39.698518+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-code-verify.ts

## Purpose

Verifies a user-supplied code against the delivered-code slot stored on the account. It deliberately separates the pure comparison (`checkDeliveredCode`) from the side-effectful writes (spending the code on a match, incrementing the miss counter on a failure) so the comparison is a deterministic check while the state mutations go through the users service's conditional-write ("door") primitives. The same code path serves both second-factor verification and step-up re-authentication.

## Key elements

- **`verifyDeliveredCode(user, slot, state, code)`** (exported) — Pure-or-side-effect split:
  - Runs `checkDeliveredCode(state, code, now)` to get a `'match' | 'miss' | (other)` verdict.
  - On **match**: delegates to `userService.spendDeliveredCode`, which atomically consumes the code (the passed `hash` acts as an optimistic-lock token so a concurrent duplicate call loses the spend).
  - On **miss**: delegates to `userService.recordDeliveredMiss` to increment the attempt counter, then resolves `false`.
  - Any other verdict (expired, already spent, etc.) resolves `false` with no write.
- **`DELIVERED_CODE_MAX_ATTEMPTS`** (imported from `./delivered-codes`) — the attempt ceiling passed to the users-service writes so the door can enforce lockout.
- **`checkDeliveredCode`** (imported from `./delivered-codes`) — the pure comparison function; this file never re-implements the hash check.

## Relationships

- **`src/modules/account/two-factor/delivered-codes.ts`** — Provides `checkDeliveredCode` (pure verify) and the `DELIVERED_CODE_MAX_ATTEMPTS` constant. This file is the *write-path* counterpart; `delivered-codes.ts` is the *read/compute-path*.
- **`src/modules/users/index.ts`** — Barrel import source for `userService`, `UserDocument`, `DeliveredCodeSlot`, and `DeliveredCodeState`.
- **`src/modules/users/model.ts`** — Likely definition site for the `UserDocument`, `DeliveredCodeSlot`, and `DeliveredCodeState` types used as parameters.
- **`src/modules/users/services/index.ts`** — Source of the `userService` object whose `spendDeliveredCode` / `recordDeliveredMiss` methods perform the conditional writes behind the "users door."
- **`src/modules/account/two-factor/index.ts`** — Directory barrel; re-exports `verifyDeliveredCode` for consumers outside the two-factor folder.
- **`src/modules/account/services/reauth.ts`** — Upstream consumer: the step-up / re-auth flow calls `verifyDeliveredCode` for the step-up code path.
- **`src/modules/account/two-factor/methods/email.ts`** — Upstream consumer: the email delivery method drives the second-factor verification loop that invokes `verifyDeliveredCode`.

## Notes

- The function is intentionally **not async in its own body** — it wraps the sync `checkDeliveredCode` and returns a `Promise<boolean>` only because the two write branches (`spendDeliveredCode`, `recordDeliveredMiss`) are async. The "no state" and "other verdict" paths short-circuit with `Promise.resolve(false)` to avoid an unnecessary DB round-trip.
- **Spent-once guarantee** relies on the `hash` value acting as a conditional-write token: if two requests carry the same code, only the first `spendDeliveredCode` call succeeds; the second sees the slot already changed and silently fails. Callers can therefore fire the verify concurrently without extra locking.
- The `now` timestamp is captured **once** at the top of the function and passed to both `checkDeliveredCode` and the service writes, keeping the expiry window consistent within a single call.
- The file is a `@module` (no default export, no named class); the only public symbol is `verifyDeliveredCode`.
