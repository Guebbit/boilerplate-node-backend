---
source: src/modules/example/services/personal-data.ts
sha256: 72d2212a73d0141edc1c4da1523d167c971ef5d6a03e4857a343ad66f8cb0781
generated_at: 2026-10-29T03:56:22.489502+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/personal-data.ts

## Purpose

Implements the personal-data lifecycle for the `example` module: collecting every example a person owns (for account export) and erasing them (for account deletion). Registered on the module manifest as `personalData`, so `account` and `users` invoke these operations through the registry without importing this file directly.

## Key elements

- **`collectPersonalData(subject: PersonalDataSubject): Promise<ExportExample[]>`** — Reads all examples (drafts, active, archived) belonging to the subject via paginated `readAll` + `exampleRepository.findAll`, resolves the owner's name, normalizes rows, and maps them through `presentExampleExport` into the export contract shape.
- **`eraseForUser(userId: string, session: ClientSession): Promise<AfterErase>`** — Deletes all examples owned by the user inside the erasure transaction. Returns an `AfterErase` callback that removes cover-image files from `imageStore`; the callback is invoked only after the transaction commits because file deletion is non-transactional.

## Relationships

- **`../repository.ts`** — `exampleRepository` supplies `findAll`, `normalize`, and `deleteAllOf`; the core data access used by both exports.
- **`../presenter.ts`** — `presentExampleExport` shapes a normalized row into the `ExportExample` contract.
- **`./owner.ts`** — `ownerNameOf` resolves the display name of the account owner for the export payload.
- **`@infrastructure/adapters/image-store.ts`** — `imageStore.remove` deletes cover-image files in the post-commit step of erasure.
- **`@infrastructure/persistence/create-repository.ts`** — `toObjectId` converts the string `userId` to a Mongo ObjectId for queries.
- **`@infrastructure/persistence/search.ts`** — `readAll` and `MAX_CONFIGURED_PAGE_SIZE` drive the paginated read loop in `collectPersonalData`.
- **`@kernel/registry.ts`** — Provides the `PersonalDataSubject` and `AfterErase` types that define the public contract of both exports.
- **`@types` (src/types/index.ts)** — `ExportExample` is the element type of the collected export array.
- **`../module.ts`** — Registers this file as the `personalData` entry on the module manifest.
- **`../tests/integration/capabilities.test.ts`** — Integration tests exercise both `collectPersonalData` and `eraseForUser`.

## Notes

- The two exports are called **through the registry**, not by direct import. Adding or removing this file changes what the account system sees for the module without touching `account` or `users` code.
- `eraseForUser` deliberately splits work into a transactional DB delete and a post-commit file cleanup. If you change this, preserve the "DB first, files after commit" ordering—files cannot roll back.
- `collectPersonalData` sorts by `createdAt desc, _id asc` to get a stable ordering across pagination pages.
- Per the file's own JSDoc: delete this file if the module no longer stores any per-person data.
