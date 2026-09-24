---
source: src/modules/users/tests/integration/service.test.ts
sha256: 353c616e98254de4c6d50b49cc5a003dd36de91606e3eff48d3e087dbc6383c7
generated_at: 2026-09-23T19:36:18.286579+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/service.test.ts

## Purpose

Integration test suite for `userService` covering data validation, search/filter/pagination, and admin create/update/delete flows. Runs against a real in-memory MongoDB instance (via `setupTestDb`) rather than mocks, exercising the repository and model layers as the service would see them in production.

## Key elements

- **`expectCreated(...)`** — Helper that calls `userService.create`, asserts the envelope is `success: true`, and returns the unwrapped `UserDocument`. Keeps individual tests to one fewer assertion.
- **`seedActiveAndDeleted()`** — Creates three users whose `active` and `deletedAt` values disagree, backing the `active`-filter tests (deactivated ≠ deleted; deleted-but-active is a distinct case).
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` with a `jest.fn()` _and_ manually rewires `recordAudit` to call that replacement (because `recordAudit` closes over its own module's original binding, immune to a plain property override).
- **`jest.mock('@infrastructure/adapters/image-store')`** — Stubs `imageStore.remove` to resolve `true`; the service only needs a handle, not real file I/O.
- **`describe('userService.validateData')`** — Checks email/username/password rules, role names, `imageUrl` as a relative path, tolerance of undeclared keys, wrong-typed flags, and that error messages are translated (not raw i18n keys).
- **`describe('userService.search')`** — Covers default pagination, text/email/username filters, `active` vs. soft-delete semantics, phone decryption through `toUser` on a lean document, and empty-collection meta.
- **`describe('userService.getById')`** — Retrieves a user by ID (content truncated in source).

## Relationships

- **`src/modules/users/service.ts`** — System under test; all `describe` blocks call its exported functions directly.
- **`tests/support/setup-test-db.ts`** — Called once at module top-level to wire up the in-memory Mongo that `userRepository` talks to.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for seeding valid documents and realistic passwords.
- **`tests/support/callers.ts`** — Supplies `testCallerContext` and `callerContextAs` to simulate authenticated/tenant-scoped callers in service calls.
- **`tests/support/ports.ts`** — `observePort` helper (referenced in the audit-mock comment) for clearing and re-exposing `jest.fn()` ports.
- **`src/infrastructure/observability/audit.ts`** — Mocked; tests spy on `emitAuditEvent` to assert audit side-effects.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` register and flush domain-event listeners between tests.
- **`src/modules/access/index.ts`** — `assignRole`, `membershipsOf`, `rolesOf` used to verify role-assignment side-effects of create/update.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` identifies the tenant scope for test caller contexts.
- **`src/modules/users/model.ts`** — `toUser` and `UserDocument` type used to assert shape of returned documents.
- **`src/modules/users/events.ts`** — `USER_SETUP_REQUESTED` event constant asserted on domain-event emissions.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape the envelope assertions.

## Notes

- The `audit` mock is intentionally over-engineered: `recordAudit` captures its module-local `emitAuditEvent` at definition time, so a simple property swap on the module namespace is invisible to it. The mock re-implements `recordAudit` to route through the _replacement_ fn, preserving spy visibility.
- `search()` internally uses the `.lean()` repository path (plain objects, not hydrated Mongoose docs). The phone-decryption test explicitly calls `toUser` on a lean item to confirm it works on both shapes.
- The `active` filter and soft-deletion (`deletedAt`) are orthogonal: a deleted account can still be `active: true`, and the `active: true` filter deliberately includes it.
- Validation tests assert the _shape_ of i18n keys (dotted identifier regex) rather than exact message text, so copy changes don't break the suite.
- `setupTestDb()` is invoked at module scope (not in `beforeEach`), so the in-memory DB is shared across all tests in this file; tests rely on unique emails/usernames for isolation.
