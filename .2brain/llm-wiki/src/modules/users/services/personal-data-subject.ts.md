---
source: src/modules/users/services/personal-data-subject.ts
sha256: 1c98e638333361b512d91a0288b7389a1e588017822ba1a90145f9ce78f694f4
generated_at: 2026-11-08T08:50:24.277596+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/personal-data-subject.ts

## Purpose

Defines the single canonical shape of a "personal data subject" (who an export or erasure targets) derived from a stored `UserDocument`. Both the account export flow and the user-removal cascade consume this so every downstream module sees the same identity fields without re-deriving them independently.

## Key elements

- **`personalDataSubjectOf(user, erasedAt?)`** — The sole export. Maps a `UserDocument` to a `PersonalDataSubject` object containing `userId` (stringified `_id`), `email`, `emailVerified` (derived from `Boolean(user.verifiedAt)`), and conditionally `erasedAt` (only when the optional date argument is supplied).

## Relationships

- **`src/kernel/registry.ts`** — Source of the `PersonalDataSubject` type imported here; this file is where the type gets populated from a concrete document.
- **`src/modules/users/model.ts`** — Provides the `UserDocument` type that serves as the input parameter.
- **`src/modules/users/services/remove.ts`** — Erasure-cascade consumer; receives the subject object so each section it visits addresses the same identity.
- **`src/modules/account/services/export-job.ts`** — Export-flow consumer; receives the subject so `personalData` sections collect rows for the same identity.
- **`src/modules/users/services/index.ts`** — Barrel re-export; makes this function available to callers via the services namespace.

## Notes

- `emailVerified` is intentionally a boolean gate: a section that matches rows by email should only respond when the account has actually verified that address, since anyone can register a stranger's address.
- `erasedAt` is spread conditionally (`...(erasedAt ? { erasedAt } : {})`), so the key is **absent** (not `undefined`) in the normal export case.
- `userId` is coerced to `String(user._id)`; callers should not expect an `ObjectId` here.
