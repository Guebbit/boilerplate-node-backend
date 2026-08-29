# tests/unit/infrastructure/persistence/seed.test.ts

## Purpose

Unit tests for the `upsertById` helper, covering both branches of its upsert policy: the **created** path (no prior document) and the **skipped** path (id already present). The skip arm historically went unexercised by integration suites (which always seed into a fresh database), leaving that branch invisible to coverage; this file exists to pin that behavior explicitly.

## Key elements

- **`FIXTURE`** – A shared document object with a pinned Mongoose `ObjectId` (`65de646a…`) and a `name` field, used as the argument in both tests.
- **Test: "creates when no document carries the pinned id"** – Stubs `repository.findById` to resolve `null`, asserts `upsertById` resolves `'created'`, and verifies `repository.create` was called with the fixture.
- **Test: "skips when the id already exists"** – Stubs `repository.findById` to resolve the fixture, asserts `upsertById` resolves `'skipped'`, and verifies `repository.create` was **not** called.
- **Mock repository** – Inline object (`{ findById, create }`) constructed per test via `jest.fn()`, avoiding any real database or Mongoose model.

## Relationships

- **`src/infrastructure/persistence/seed.ts`** – The sole subject under test. This file imports `upsertById` from that module and exercises both of its return paths (`'created'` / `'skipped'`).

## Notes

- The tests are framework-agnostic with respect to Mongoose: the only Mongoose import is `Types.ObjectId` to construct a valid fixture `_id`. The repository is a plain object, so no `mongoose` connection or model is required.
- The `expect.anything()` matcher on the second argument to `create` in the "creates" test means the test does **not** assert a specific options object — only that something was passed.
- The file's header comment (the block at the top) is a project-level note explaining *why* this test was added, not a JSDoc for an export. It documents a coverage-gap incident rather than describing the module's API.
