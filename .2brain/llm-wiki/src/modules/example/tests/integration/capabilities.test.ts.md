---
source: src/modules/example/tests/integration/capabilities.test.ts
source_sha256: 73d2b38aac7c135912e4df2e26de1db4d8c36f91a62b48d5d0c22ff8139f28bf
context_sha256: 7c84507bc0ba25de017e47b95776702bd69f2c95a2e78d6fbd97c49b2e551c36
generated_at: 2026-11-22T05:14:02.470397+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/integration/capabilities.test.ts

## Purpose
Integration tests for the example module's optional capabilities, each proved separately against a real test database: the publish mail, the cover image, personal-data export and erasure, the two writes the `locales` port makes on the collection, and the image digest writeback.

## Key elements
- **Mocks**
  - `@infrastructure/adapters/mailer`: `enqueueEmail` is replaced with a jest mock (`mockEnqueueEmail`) so cases can assert which mail was queued.
  - `@infrastructure/adapters/image-store`: only `imageStore.remove` is stubbed; the rest of the real module is kept, since `applyImageWriteback` is a pure mutation.
  - `@infrastructure/observability/audit`: replaced with `auditPortMock()` from `@tests/ports`.
- **Setup**: `setupTestDb()`. An `afterEach` calls `resetDomainEvents()` and `jest.clearAllMocks()`.
- **`subscribe()`**: calls `exampleModule.subscribe()` to wire the module's listener to the event bus, as `registerModules` does at boot.
- **`image(name)`**: helper returning `imageUrl`, `thumbnailUrl` and `pendingImageKey` fields for a cover.
- **`describe('the publish mail')`**:
  - Emitting `EXAMPLE_PUBLISHED` mails the owner in their locale (Italian subject and greeting).
  - Nothing is sent if the owner is banned (`active: false`), is in deletion grace, or no longer exists.
- **`describe('setCover')`** (via `exampleService.setCover`):
  - Stores the url and thumbnail, and emits an `EXAMPLE_COVER_CHANGED` audit event.
  - Removes the replaced cover from the image store, but not the new one.
  - Still succeeds, and logs `Post-commit step failed: image enqueue.`, when the post-commit image hand-off fails (a pending key with nothing quarantined under it).
  - Returns 404 and changes nothing for another user's example.
- **`describe('personal data')`**:
  - `collectPersonalData` exports all of the subject's examples, drafts included, and none belonging to others. Each entry carries `ownerName`.
  - It returns `[]` for a subject with no examples.
  - `eraseForUser`, run inside `withTransaction`, deletes only the subject's rows. Cover file removal is deferred to the returned after-commit step.
- **`describe('the writes `locales` makes on this collection')`** (via `exampleRepository.translatable`):
  - `revisionOf` returns the edit counter (0 for a new row, `undefined` for a missing id).
  - `writeDerived` copies the fallback-language title without changing `updatedAt`.
  - `markEdited` advances `updatedAt`, which serves as the ETag.
- **`describe('the image digest writeback')`**: begins by checking that digested urls are written only when the pending key still matches, and that the key is then cleared. The rest of this block is not covered here.

## Relationships
- Uses `@kernel/events` (`emitDomainEvent`, `resetDomainEvents`) with `EXAMPLE_PUBLISHED` from `../../events` to drive the mail listener.
- Uses `exampleModule` (`../../module`) for `subscribe()`, `exampleService` (`../../services`) for `setCover`, `../../services/personal-data` for `collectPersonalData` and `eraseForUser`, and `exampleRepository` (`../../repository`) for counts, lookups and `translatable` writes.
- Checks `exampleAuditActions` from `../../audit` against the mocked `@infrastructure/observability/audit` port.
- Mocks `enqueueEmail` from `@infrastructure/adapters/mailer`.
- Spies on `logger` from `@infrastructure/adapters/logger` to assert the post-commit failure is logged.
- Uses `withTransaction` from `@infrastructure/runtime/database` to run erasure.
- Builds fixtures with `createExample` and `fieldOf` from `../factories`, and `createUser` from `@modules/users/tests/factories`.
- Uses `ExampleStatus` from `@types`.

## Notes
- The mailer and image-store mocks are declared with `jest.mock`; the audit mock delegates to `@tests/ports` through `jest.requireActual`.
- Erasure tests assert that `imageStore.remove` is not called until the returned after-commit function runs.
- The `updatedAt` test waits 5 ms before `markEdited` so the timestamp can differ.
- The `logger` error spy is restored manually with `mockRestore()` at the end of the test.
