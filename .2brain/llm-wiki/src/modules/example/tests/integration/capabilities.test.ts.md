---
source: src/modules/example/tests/integration/capabilities.test.ts
sha256: f3303808ae71b0e71eede1ccf28ad7e25037a8f3f2a4b250d30796c82bb9a8c8
generated_at: 2026-11-14T20:01:08.388595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/capabilities.test.ts

## Purpose

Integration tests for the example module's optional capabilities, each proven in isolation: publish-mail dispatch (via the real `subscribe` wiring), cover-image management, GDPR data export/erasure, the two writes the `locales` port performs on the collection, and the image digest writeback. The suite exercises real module subscriptions and repository calls against a test database, while stubbing only external side-effects (mail, file-system removal, audit emission).

## Key elements

- **`subscribe()`** — Helper that wires `exampleModule.subscribe()` to the kernel event bus, mirroring what `registerModules` does at boot. Called before each publish-mail test.
- **`image(name)`** — Builds the three-field object (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) that `setCover` accepts for a cover called `name`.
- **`describe('the publish mail')`** — Verifies `enqueueEmail` is called with the owner's locale-appropriate subject/greeting, and is *not* called for banned users, users in deletion grace, or nonexistent users.
- **`describe('setCover')`** — Covers URL+thumbnail persistence, audit emission, post-commit image cleanup of the replaced file, post-commit failure logging, and 404 isolation for non-owners.
- **`describe('personal data')`** — Validates `collectPersonalData` (scoped to the subject, includes drafts) and `eraseForUser` (transactional row deletion, deferred file removal via `withTransaction` post-commit step).
- **`describe('the writes locales makes on this collection')`** — Exercises `exampleRepository.translatable`: `revisionOf` (read), `writeDerived` (fallback-title copy without bumping `updatedAt`), `markEdited` (bumps `updatedAt`/ETag).
- **`describe('the image digest writeback')`** — Tests `applyImageWriteback`: writes digested URLs only when `pendingImageKey` still matches, then clears the key.
- **Mocks at module level** — `enqueueEmail` (fully stubbed), `imageStore.remove` (only the filesystem call; `applyImageWriteback` runs for real), and the audit port (replaced with `auditPortMock()` from `@tests/ports`).

## Relationships

- **`src/kernel/events.ts`** — `emitDomainEvent` / `resetDomainEvents` drive the publish-mail tests; the module's `subscribe` registers a listener for `EXAMPLE_PUBLISHED`.
- **`src/modules/example/module.ts`** — Provides the `exampleModule` whose `subscribe()` wiring is exercised in the publish-mail tests.
- **`src/modules/example/events.ts`** — Provides `EXAMPLE_PUBLISHED` used to trigger the mail flow.
- **`src/modules/example/audit.ts`** — Supplies `exampleAuditActions` constants asserted in `setCover` audit spy.
- **`src/modules/example/repository.ts`** — `exampleRepository` (`.save`, `.count`, `.findById`, `.translatable.*`) is exercised directly throughout.
- **`src/modules/example/services/index.ts`** — Exports `exampleService`, whose `setCover` is the primary service method under test.
- **`src/modules/example/services/personal-data.ts`** — Exports `collectPersonalData` and `eraseForUser`, both tested here.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked; assertions target `enqueueEmail` call shape.
- **`src/infrastructure/adapters/logger.ts`** — Spied on in the post-commit failure case to assert the error log message.
- **`src/infrastructure/observability/audit.ts`** — Replaced via `auditPortMock()`; observed through `observePort`.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the erasure test to verify transactional semantics and post-commit file deletion.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds owner/stranger/banned users.
- **`src/modules/example/tests/factories.ts`** — `createExample` and `fieldOf` create documents and read single fields.
- **`src/types/index.ts`** — `ExampleStatus` used to mark a published example in the export test.

## Notes

- The image-store mock intentionally keeps `applyImageWriteback` real (it is a pure mutation); only `imageStore.remove` (the filesystem call) is stubbed. This is the only partial mock in the file and is called out in a comment.
- The audit port is not mocked with a plain `jest.fn()`; it is replaced by `auditPortMock()` from `@tests/ports`, which supports `observePort` spying.
- `afterEach` resets both the kernel event bus and all mocks; `setupTestDb()` runs once before the suite.
- The "post-commit step failed" test relies on a `pendingImageKey` pointing to a nonexistent quarantined file to force the hand-off to fail *after* the DB commit succeeds.
- The `locales` writeback test asserts that `updatedAt` is unchanged after `writeDerived` (it is a derived-field copy, not a user edit), but *does* move after `markEdited`.
