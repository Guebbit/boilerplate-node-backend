---
source: src/modules/example/tests/integration/capabilities.test.ts
sha256: 6ceeaaba66e3c9cc48ea6ce95143463c4eab6992f75dff4753616ba9357d42e7
generated_at: 2026-10-14T15:47:15.702253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/capabilities.test.ts

## Purpose

Integration test suite that exercises the example module's optional capabilities against a real test database: the publish notification mail, cover-image upload/rotation, personal-data export and erasure (GDPR-style), the two repository writes the `locales` port performs on the collection, and the image-digest writeback guard. Each capability is proved in isolation so that a regression in one does not mask a break in another.

## Key elements

- **`describe('the publish mail')`** — Emits `EXAMPLE_PUBLISHED` on the domain-event bus (after calling `exampleModule.subscribe()`) and asserts `enqueueEmail` fires with the owner's locale-appropriate subject/greeting; also asserts no mail for a missing user.
- **`describe('setCover')`** — Calls `setCover` (from `services/index`) and verifies URL/thumbnail persistence, old-cover file deletion via `imageStore.remove`, and a 404 response when a non-owner attempts the write.
- **`describe('personal data')`** — Exercises `collectPersonalData` (export scoped to the subject, drafts included, owner name stamped) and `eraseForUser` inside `withTransaction`, confirming rows are deleted atomically while cover-file removal is deferred to the post-commit callback.
- **`describe('the writes locales makes…')`** — Covers `exampleRepository.existsById`, `writeTranslatedFields` (overwrite + null→empty-string), and `markEdited` (bumps `updatedAt` without counting as a content edit).
- **`describe('the image digest writeback')`** — Verifies `exampleRepository.writebackImage` applies URLs only when the `pendingImageKey` still matches, ignores stale keys, and treats a repeat of an already-applied job as "held."
- **Mocks (top of file)** — `enqueueEmail` (mailer), `imageStore.remove` (image-store, with `requireActual` so `applyImageWriteback` still runs), and the audit port (`emitAuditEvent` intercepted, `recordAudit` rebuilt around the real `buildAuditEvent`).
- **`subscribe()` helper** — Calls `exampleModule.subscribe()` to wire the listener to the bus, mirroring what `registerModules` does at boot.

## Relationships

- **`@infrastructure/adapters/mailer`** — Mocked; `enqueueEmail` is the sole mail side-effect the publish test asserts on.
- **`@infrastructure/observability/audit`** — Partially mocked; `emitAuditEvent` is spied so `setCover`'s audit assertion can use `observePort`.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the erasure test to prove row-delete is atomic while file-delete is deferred.
- **`@kernel/events`** — `emitDomainEvent` / `resetDomainEvents` drive the publish-mail scenario; events are cleared in `afterEach`.
- **`@modules/example/module`** — `exampleModule.subscribe()` attaches the module's listener for the publish-mail test.
- **`@modules/example/events`** — Exports the `EXAMPLE_PUBLISHED` event token used as the emit target.
- **`@modules/example/audit`** — Provides `exampleAuditActions.EXAMPLE_COVER_CHANGED` for the audit assertion in the cover test.
- **`@modules/example/repository`** — The primary system under test for the locales and writeback blocks (`existsById`, `writeTranslatedFields`, `markEdited`, `writebackImage`, `save`, `count`, `findById`).
- **`@modules/example/services/personal-data`** — Source of `collectPersonalData` and `eraseForUser` exercised in the personal-data block.
- **`@modules/example/services/index`** — Re-exports `setCover`, the function under test in the cover block.
- **`@modules/example/tests/factories`** — `createExample` and `fieldOf` provide seeded rows and a small helper to read a single document field.
- **`@modules/users/tests/factories`** — `createUser` creates the owner/stranger identities used across every block.
- **`@types`** — `ExampleStatus` enum used to mark a row as published in the export test.
- **`tests/support/callers`** — `callerContextAs` builds the authenticated caller context passed to `setCover`.

## Notes

- Only the filesystem-touching `imageStore.remove` is stubbed; `applyImageWriteback` runs as a real pure mutation so the writeback logic is tested, not bypassed.
- The audit mock spreads `requireActual` and then overrides `recordAudit` to call the real `buildAuditEvent` internally, so event shapes stay realistic.
- The erasure test relies on the `withTransaction` callback pattern: `eraseForUser` returns an `afterErase` thunk that must be awaited *outside* the transaction to trigger deferred file deletion — forgetting to call it will leave `imageStore.remove` un-invoked and the assertion will fail.
- `afterEach` resets domain events *and* clears all mocks; ordering matters because `subscribe()` re-attaches a listener each test and stale listeners would cause double-mail in subsequent runs.
- The file uses `MISSING_ID` (from `@tests/ids`) for "non-existent entity" cases rather than a fresh `ObjectId`, making intent explicit.
