---
source: src/modules/example/tests/integration/capabilities.test.ts
sha256: 16ab28a7d893f3cc362ec3e87e8e78c88f285602073a2c87748b2e3b44a6e6ac
generated_at: 2026-10-29T03:57:27.225737+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/capabilities.test.ts

## Purpose

Integration tests proving each optional capability of the example module against a real in-memory MongoDB: the publish notification mail (via the domain-event → `subscribe` wiring), the cover-image lifecycle (`setCover`), GDPR personal-data export/erasure, and the three writes the `locales` port makes on the example collection. Each capability is tested in isolation so a regression in one does not mask the others.

## Key elements

- **`subscribe()`** — one-liner helper that calls `exampleModule.subscribe()`, replicating what `registerModules` does at boot so event listeners are active before `emitDomainEvent`.
- **"the publish mail" suite** — verifies `enqueueEmail` is called with the correct locale-aware subject/greeting, and is *not* called for banned users, users in deletion grace, or orphaned user IDs.
- **"setCover" suite** — covers URL/thumbnail persistence, audit emission (`EXAMPLE_COVER_CHANGED`), old-image deletion after new-image commit, post-commit image-handoff failure (logged, not thrown), and 404 for non-owner access.
- **"personal data" suite** — exercises `collectPersonalData` (includes drafts, excludes other users, returns `[]` for empty) and `eraseForUser` (transactional row deletion + deferred `imageStore.remove` after commit).
- **"the writes `locales` makes on this collection" suite** — tests the `exampleRepository.translatable` port: `exists`, `writeDerived` (sets fallback title without bumping `updatedAt`), null→empty-string coercion, and `markEdited` (bumps `updatedAt`/ETag only).
- **"the image digest writeback" suite** — (truncated) verifies digest URLs are written only while the pending key is still resolvable.
- **Mocks** — `mailer.enqueueEmail` (full mock), `imageStore.remove` (partial; `applyImageWriteback` stays real), `auditPort` (via `auditPortMock()` from `@tests/ports`).
- **`afterEach`** — resets the domain-event bus and clears all jest mocks.

## Relationships

- **`@kernel/events`** — `emitDomainEvent` triggers the module's listener; `resetDomainEvents` tears it down between tests.
- **`@infrastructure/adapters/mailer`** — the sole external side-effect of the publish-mail path; fully mocked.
- **`@infrastructure/adapters/logger`** — spied on (`logger.error`) to assert post-commit failure is logged, not thrown.
- **`@infrastructure/observability/audit`** — replaced with `auditPortMock()` so `observePort` can capture emitted audit actions.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps `eraseForUser` to prove row deletion is atomic and file cleanup is deferred.
- **`@modules/example/module`** — `exampleModule.subscribe()` wires the event listener under test.
- **`@modules/example/events`** — `EXAMPLE_PUBLISHED` is the domain event the publish-mail tests emit.
- **`@modules/example/audit`** — `exampleAuditActions.EXAMPLE_COVER_CHANGED` is the expected audit action in the cover tests.
- **`@modules/example/repository`** — `exampleRepository` is used directly for `save`, `count`, `findById`, and the `translatable` sub-port.
- **`@modules/example/services`** — `exampleService.setCover` is the SUT for the cover-image suite.
- **`@modules/example/services/personal-data`** — `collectPersonalData` and `eraseForUser` are the SUTs for the GDPR suite.
- **`@modules/example/tests/factories`** — `createExample` seeds rows; `fieldOf` reads a single column back.
- **`@modules/users/tests/factories`** — `createUser` seeds the owner/other accounts each test needs.

## Notes

- The tests run against a **real MongoDB** (`setupTestDb()`); only I/O adapters (mailer, image-store file removal, audit sink) are mocked. This is intentional: it exercises the module's event wiring, transaction boundaries, and repository queries end-to-end.
- `imageStore` is a **partial mock** — only `remove` is stubbed. The pure `applyImageWriteback` mutation runs for real, so digest-writeback tests exercise the actual mapping logic.
- The `locales` port's `writeDerived` is expected to **not** bump `updatedAt`; the `markEdited` call is the only path that does. Tests assert this explicitly to guard against accidental coupling.
- `eraseForUser` returns a **post-commit callback** (`afterErase`); file deletion is asserted to have *not* happened before that callback is invoked, enforcing the "commit first, side-effect second" contract.
- The publish-mail test uses `locale: 'it'` to confirm the mailer receives a localized subject and greeting, coupling the test to the mailer's i18n contract rather than a hard-coded English string.
