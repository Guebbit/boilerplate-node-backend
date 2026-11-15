---
source: src/modules/account/two-factor/delivered-code-verify.ts
sha256: 94a651e1b02febfde3222790c54a592e9193256d53c622e7cc7ed94b7b60f56d
generated_at: 2026-11-14T19:17:45.552256+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-code-verify.ts

## Purpose

Single-point verification of a delivered (2FA / step-up) code against an account. It splits the work into a **pure comparison** (`checkDeliveredCode`) and **conditional writes** (spend on match, record a miss on failure) so that concurrent callers cannot double-spend a code. The same path is used for a second factor's code and for a step-up reauth code.

## Key elements

- **`verifyDeliveredCode(user, slot, state, code): Promise<boolean>`** — The only export. Takes the account document, the code slot identifier, the slot's currently-loaded state, and the typed code. Resolves to a boolean indicating whether *this* call was the one that spent the code; resolves `false` for a miss, an expired/absent code, or a lost race.

## Relationships

- **`./delivered-codes`** — Imports `checkDeliveredCode` (the pure hash-comparison logic) and `DELIVERED_CODE_MAX_ATTEMPTS` (the attempt cap passed to the write helpers).
- **`@modules/users/friends/account`** — Imports `accountUserService`, whose `spendDeliveredCode` and `recordDeliveredMiss` methods perform the conditional, door-guarded writes.
- **`@modules/users` (index)** — Source of the `UserDocument`, `DeliveredCodeSlot`, and `DeliveredCodeState` types that shape the function signature.

## Notes

- The file deliberately avoids a read-modify-write cycle: the verdict is computed in-memory, and the only writes are the two conditional operations above. A concurrent caller with the same `hash` will lose the spend, enforcing single-use semantics without a lock.
- Missing `state` or `codeHash` short-circuits to `false` without touching the database.
- A verdict other than `'match'` or `'miss'` (e.g. expired) also resolves to `false` silently — callers should not rely on exceptions for the "code is no longer valid" case.
