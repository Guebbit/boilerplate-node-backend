---
source: src/modules/example/services/personal-data.ts
sha256: 256303518a6caaec3865edb1430fda53b5dc0c83e739209d00f3a7c66cb7b877
generated_at: 2026-10-14T15:46:19.796376+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/personal-data.ts

## Purpose

Implements the two GDPR-style personal-data operations for the `example` module: exporting all examples owned by a given user (`collectPersonalData`) and erasing them (`eraseForUser`). The functions are registered on the module manifest as `personalData`, so `account` and `users` invoke them indirectly through the kernel registry without importing this file.

## Key elements

- **`collectPersonalData(subject: PersonalDataSubject): Promise<Example[]>`** — Pages through *all* examples (drafts + archived) owned by `subject.userId`, fetches the owner's display name via `ownerNameOf`, and returns the rows shaped by `presentExampleRow`.
- **`eraseForUser(userId: string, session: ClientSession): Promise<AfterErase>`** — Deletes all examples owned by `userId` inside the caller's Mongoose transaction. Resolves to an **`AfterErase` callback** that, when invoked *after commit*, removes the users' cover-image files from `imageStore`.

## Relationships

- **`image-store.ts`** — `eraseForUser` collects image URLs from the repository's `deleteAllOf` result and passes them to `imageStore.remove` in the post-commit step.
- **`create-repository.ts`** — Provides the `toObjectId` helper used to build the `userId` filter.
- **`search.ts`** — Supplies `readAll` (pagination loop) and `MAX_CONFIGURED_PAGE_SIZE` for the export query.
- **`registry.ts`** — Source of the `PersonalDataSubject` and `AfterErase` type contracts that both functions implement.
- **`module.ts`** — Declares this service on the manifest under `personalData`, making it discoverable by `account`/`users` without a direct import.
- **`presenter.ts`** — `presentExampleRow` shapes each normalized row into the export contract's shape.
- **`repository.ts`** — `exampleRepository` provides `findAll`, `deleteAllOf`, and `normalize` used by both functions.
- **`owner.ts`** — `ownerNameOf` resolves the user's display name for the export.
- **`capabilities.test.ts`** — Integration tests exercising both functions end-to-end.
- **`types/index.ts`** — Exports the `Example` type used as the return shape of `collectPersonalData`.

## Notes

- **Image deletion is deliberately post-commit.** File-store deletions cannot participate in a Mongoose transaction, so `eraseForUser` returns a thunk (`AfterErase`) that the caller must execute only after the transaction commits. If the caller forgets to invoke it, or if it throws, orphaned image files will persist.
- **No direct import by consumers.** `account` and `users` resolve these functions through the manifest/registry; importing this module directly would bypass that indirection.
- **Pagination is internal.** `collectPersonalData` handles paging transparently via `readAll`; callers never see page numbers.
