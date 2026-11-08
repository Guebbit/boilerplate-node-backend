---
source: src/modules/example/services/personal-data.ts
sha256: 72d2212a73d0141edc1c4da1523d167c971ef5d6a03e4857a343ad66f8cb0781
generated_at: 2026-11-08T05:54:10.369406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/personal-data.ts

## Purpose

Defines the two GDPR-style personal-data operations for the example module: **collect** (export all examples a person owns, shaped to the export contract) and **erase** (delete those examples and their cover images). Registered on the module manifest as `personalData`, so `account` and `users` invoke these functions without importing this file directly.

## Key elements

- **`collectPersonalData(subject: PersonalDataSubject)`** — Fetches every example owned by the subject (drafts and archived included) via paginated `readAll`, resolves the owner's display name, then maps each row through `presentExampleExport`. Returns `Promise<ExportExample[]>`.
- **`eraseForUser(userId, session)`** — Deletes all of the user's examples inside the provided Mongoose transaction. Returns a post-commit callback (`AfterErase`) that removes cover image files from `imageStore`.

## Relationships

- **`@kernel/registry`** — Supplies the `PersonalDataSubject` and `AfterErase` contract types both functions implement.
- **`../repository`** (`exampleRepository`) — Source of `findAll`, `normalize`, and `deleteAllOf`; the data-access layer this service delegates to.
- **`../presenter`** — `presentExampleExport` shapes a normalized row into the `ExportExample` contract shape.
- **`./owner`** — `ownerNameOf` resolves the display name embedded in each exported row.
- **`@infrastructure/persistence/search`** — Provides `readAll` (pagination loop) and `MAX_CONFIGURED_PAGE_SIZE` used by `collectPersonalData`.
- **`@infrastructure/persistence/create-repository`** — `toObjectId` converts the subject's string `userId` to a MongoDB ObjectId for querying.
- **`@infrastructure/adapters/image-store`** — `imageStore.remove` deletes cover image files in the post-commit erasure step.
- **`@types`** — `ExportExample` type defines the shape returned by `collectPersonalData`.
- **`../module.ts`** — Declares this file as the `personalData` entry on the module manifest.
- **`../tests/integration/capabilities.test.ts`** — Integration tests exercise both `collectPersonalData` and `eraseForUser`.

## Notes

- **Image deletion is post-commit by design.** Files on disk cannot participate in the Mongoose transaction, so `eraseForUser` returns a callback that `imageStore.remove` runs only after the DB commit succeeds. If the commit rolls back, images are untouched; if the post-commit step fails, a dangling file may remain.
- **No direct imports from consumer modules.** Other modules (e.g. `account`, `users`) call these functions through the manifest/registry indirection, not by importing this file.
- **`collectPersonalData` includes all states.** Drafts and archived examples are returned, not just published ones.
