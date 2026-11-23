---
source: src/modules/account/two-factor/delivered-code-verify.ts
source_sha256: 94a651e1b02febfde3222790c54a592e9193256d53c622e7cc7ed94b7b60f56d
context_sha256: 0a602c2b0b6d5b17f1c04bbc61a64b1e51685f4174e1122868cd9cb047e11d26
generated_at: 2026-11-22T04:10:37.070305+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/delivered-code-verify.ts

## Purpose
Verifies a code that was delivered (mailed) to a user against the code currently in flight on their account, without a read-modify-write cycle. The comparison itself is pure; the consequences (spending the code or counting a miss) are conditional writes performed through the users module's account service. The same path serves both a second factor's code and the step-up code.

## Key elements
- `verifyDeliveredCode(user, slot, state, code)` — the only export. Returns `Promise<boolean>`: whether THIS call spent the code.
  - Returns `false` immediately if `state` or `state.codeHash` is missing.
  - Calls `checkDeliveredCode(state, code, now)` to get a verdict.
  - On `'match'`: calls `accountUserService.spendDeliveredCode(user, slot, hash, DELIVERED_CODE_MAX_ATTEMPTS, now)` and returns its result.
  - On `'miss'`: calls `accountUserService.recordDeliveredMiss(user, slot, hash, DELIVERED_CODE_MAX_ATTEMPTS)` and resolves to `false`.
  - Any other verdict resolves to `false` with no write.

## Relationships
- `src/modules/users/friends/account.ts` — supplies `accountUserService`, which performs the conditional spend and miss-count writes.
- `src/modules/users/index.ts` — supplies the types `UserDocument`, `DeliveredCodeSlot`, and `DeliveredCodeState`.

## Notes
- The code hash is passed to both write calls, and the docs state a parallel request holding the same code loses the spend, so a code works once. The conditional-write logic itself lives in the account service, not here.
- A `false` result does not distinguish a miss from other non-match verdicts (e.g. missing state or any verdict other than `'match'`/`'miss'`).
- `now` is captured once and shared by the check and the spend.
- `checkDeliveredCode` and `DELIVERED_CODE_MAX_ATTEMPTS` are imported from the sibling `./delivered-codes` module, which provides the pure comparison and the attempt limit.
