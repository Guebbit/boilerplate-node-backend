---
source: src/modules/example/services/personal-data.ts
source_sha256: 9061358c04ca54faf6cf801e4e171a588adfffcf2f8e61262b5dca9fc7f05ec4
context_sha256: a9330589c5a09a86fe2af5d4f7497a916f45076d539e989707806bbc2064fcfc
generated_at: 2026-11-22T05:12:57.019485+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/personal-data.ts

## Purpose
Implements the example module's personal-data contract: what the module holds about one person, for an account export (`collect`) and an account erasure (`erase`). The module manifest declares these under `personalData`, so `account` and `users` can call them without importing this module. Here, the data is the examples an account owns and their cover images. Per the header, it should be deleted if a module holds nothing about a person.

## Key elements
- `collectPersonalData(subject)`: returns every example owned by the subject's user, including drafts and archived ones, as `ExportExample[]`. It reads all pages of `exampleRepository.findAll` through `readAll`, sorted by `createdAt` descending then `_id`. It fetches the owner name with `ownerNameOf`, normalizes the rows, and maps each through `presentExampleExport`.
- `eraseForUser(userId, session)`: deletes everything the user owns through `exampleRepository.deleteAllOf(userId, session)`, inside the erasure's transaction (`ClientSession`). It returns an `AfterErase` step that removes each cover image from the image store.

## Relationships
- `src/modules/example/repository.ts`: provides `exampleRepository` (`findAll`, `normalize`, `deleteAllOf`).
- `src/modules/example/presenter.ts`: `presentExampleExport` shapes each row into the export contract.
- `src/modules/example/services/owner.ts`: `ownerNameOf` supplies the owner name for the export.
- `src/infrastructure/persistence/search.ts`: `readAll` and `MAX_CONFIGURED_PAGE_SIZE` drive the pagination.
- `src/infrastructure/persistence/create-repository.ts`: `toObjectId` converts the subject's user id into the query filter.
- `src/infrastructure/adapters/image-store.ts`: provides `imageStore`, used to delete the image files.
- `src/kernel/registry.ts`: supplies the `PersonalDataSubject` and `AfterErase` types.
- `src/types/index.ts`: supplies the `ExportExample` type.
- `src/modules/example/module.ts`: the manifest, which per the header declares these as `personalData`. The file itself does not import it.
- `src/modules/example/tests/integration/capabilities.test.ts`: a related test file. Its contents were not provided.

## Notes
- Cover images are files, not rows, so they cannot roll back with the transaction. They are deleted in the returned `AfterErase` step, which runs only after a commit.
- The export pages with `skip` and `limit` at `MAX_CONFIGURED_PAGE_SIZE`. The sort includes `_id` as a tiebreaker, which keeps the page order stable.
