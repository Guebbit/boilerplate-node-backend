---
source: src/modules/users/services/cleared-account.ts
sha256: abe42cb356ed00619d91e6b11bf420058217c77a562c1bbe6fde8abc48a91f12
generated_at: 2026-11-14T22:26:45.391149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/cleared-account.ts

## Purpose

Single, shared guard that every staff-facing account action runs first: load the user by ID, reject with 404 if absent, and reject with 403 (`ROLE_MANAGEMENT_REQUIRED`) if the caller lacks permission to manage a staff account. Exists as one canonical implementation so that no sibling service can accidentally skip the staff-role protection.

## Key elements

- **`withClearedAccount<T>(id, context, next)`** — the only export. Loads the user via `userRepository.findById`, then:
  - Returns a 404 `ResponseReject` (with i18n key `users.not-found`) if the user is not found.
  - Calls `accessService.roleProtectedRefusal(context, id)`; if it yields a refusal, that rejection is returned (403).
  - Otherwise invokes `next(user)` with the loaded `UserDocument` and returns whatever `next` resolves to.
  - Generic `T` lets each caller specify its own success type.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `generateReject` (builds the 404 rejection object) and the `ResponseReject` type used in the return union.
- **`src/infrastructure/i18n/index.ts`** — provides the `t()` translator for the 404 message.
- **`src/infrastructure/i18n/context.ts`** — transitive dependency through the i18n module (context binding).
- **`src/modules/access/index.ts`** — re-exports `accessService`; the code calls its `roleProtectedRefusal` method as the permission check.
- **`src/modules/access/services/index.ts`** — barrel that `src/modules/access/index.ts` re-exports from.
- **`src/modules/users/model.ts`** — source of the `UserDocument` type passed to `next`.
- **`src/modules/users/repository.ts`** — provides `userRepository`, from which the code calls `findById`.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — source of the `CallerContext` type.
- **`src/modules/users/services/{activation,purchase-hold,remove,update}.ts`** — sibling services that wrap their core logic inside `withClearedAccount`, inheriting the 404 / 403 guard without re-implementing it.

## Notes

- The 404 is **returned**, not thrown. The doc comment explains that a thrown miss would be indistinguishable from a genuine database error to the caller.
- Marked `@internal`: the function *is* the guard. A sibling that fetches a user directly from the repository and skips `withClearedAccount` would bypass the staff-role protection — the file header calls this out as a "privilege bug."
- `next` may be sync or async and may return either a success value or a `ResponseReject`; the wrapper does no further shaping of the result.
