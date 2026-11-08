---
source: src/modules/example/tests/integration/capabilities.test.ts
sha256: 16ab28a7d893f3cc362ec3e87e8e78c88f285602073a2c87748b2e3b44a6e6ac
generated_at: 2026-11-08T05:55:07.931487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/capabilities.test.ts

## Purpose

Integration tests that prove the example module's optional capabilities end-to-end against a real test database: the publish email (driven through the module's own `subscribe` wiring), cover-image management, GDPR-style data export and erasure, and the two writes the `locales` port performs on the collection.

## Key elements

- **`subscribe()`** — calls `exampleModule.subscribe()` to wire the module's event listeners to the bus, mirroring `registerModules` at boot.
- **`image(name)`** — builds the three-field object (`imageUrl`, `thumbnailUrl`, `pendingImageKey`) that an upload leaves on a request.
- **`describe('the publish mail')`** — verifies `EXAMPLE_PUBLISHED` → `enqueueEmail` (locale-aware subject, suppression for banned/grace-deleted/orphan owners).
- **`describe('setCover')`** — covers URL+thumbnail storage, audit emission, old-image deletion after new save, post-commit image-handoff failure logging, and 404 for non-owners.
- **`describe('personal data')`** — exercises `collectPersonalData` (exports only the subject's examples, includes drafts) and `eraseForUser` (row deletion in-transaction, file deletion deferred via the returned callback).
- **`describe('the writes locales makes on this collection')`** — tests `exampleRepository.translatable.exists`, `.writeDerived` (sets derived fields without bumping `updatedAt`), and `.markEdited` (bumps `updatedAt`/ETag).
- **`describe('the image digest writeback')`** — tests the digested-URL writeback path (content truncated in source).
- **Mocks** — `enqueueEmail` (mailer), `imageStore.remove` (image-store; `applyImageWriteback` left real), and the full `audit` port via `auditPortMock()`.

## Relationships

- **`src/modules/example/module.ts`** — imports `exampleModule` and calls its `subscribe()` to register event listeners.
- **`src/modules/example/events.ts`** — imports `EXAMPLE_PUBLISHED` to emit the publish event.
- **`src/modules/example/audit.ts`** — imports `exampleAuditActions` to assert the correct audit action code.
- **`src/modules/example/repository.ts`** — imports `exampleRepository` for direct `translatable.*` assertions and `count`/`findById` checks.
- **`src/modules/example/services/index.ts`** — imports `exampleService.setCover`.
- **`src/modules/example/services/personal-data.ts`** — imports `collectPersonalData` and `eraseForUser`.
- **`src/modules/example/tests/factories.ts`** — imports `createExample` and `fieldOf` for fixture creation and field reads.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` for owner/stranger fixtures.
- **`src/kernel/events.ts`** — imports `emitDomainEvent` / `resetDomainEvents` for the event-bus lifecycle.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` for the erasure test.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; asserts `enqueueEmail` call shape.
- **`src/infrastructure/adapters/logger.ts`** — spied on to assert the post-commit failure log.
- **`src/infrastructure/observability/audit.ts`** — replaced with `auditPortMock()` from `@tests/ports`.
- **`src/types/index.ts`** — imports `ExampleStatus` for draft vs. published fixtures.

## Notes

- The audit port is mocked via the shared `auditPortMock()` helper (from `@tests/ports`) rather than a bare `jest.fn`, keeping assertion style consistent with other port observations.
- `imageStore.remove` is the **only** image-store method stubbed; `applyImageWriteback` is intentionally left as the real (pure) implementation.
- `eraseForUser` returns a deferred callback (`afterErase`); file deletion is asserted to happen **only after** that callback is invoked, not during the transaction.
- `afterEach` resets domain events and clears all mocks; `setupTestDb()` runs once before the suite.
- The `subscribe()` helper is the single point where the module attaches to the bus—each publish-mail test calls it explicitly rather than relying on a global registration.
