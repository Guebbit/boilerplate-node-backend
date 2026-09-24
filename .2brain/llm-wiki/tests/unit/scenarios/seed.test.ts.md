---
source: tests/unit/scenarios/seed.test.ts
sha256: 4b56096531f77d56dffd29418590e93a1e890566012183012b52afacbed3c7df
generated_at: 2026-09-23T20:29:37.191148+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/seed.test.ts

## Purpose

Unit test for the `insertIfAbsent` policy in `scenarios/seed.ts`. It verifies both return arms (`'created'` and `'skipped'`) so that the idempotent boot path is locked in at the unit level, independent of integration suites that always seed into a fresh (dropped) database.

## Key elements

- **`FIXTURE`** — a shared document shape (`{ _id, name }`) with a hardcoded ObjectId used as both the lookup key and the insert payload.
- **`it('creates when no document carries the pinned id', …)`** — mocks `findById` → `null`, asserts the function resolves to `'created'` and that `repository.create` is called with the fixture.
- **`it('skips when the id already exists — a second boot is a no-op, not a rewrite', …)`** — mocks `findById` → `FIXTURE`, asserts the function resolves to `'skipped'` and that `repository.create` is **not** called.

## Relationships

- **`scenarios/seed.ts`** (imported as `@scenarios/seed`): the module under test. This file exercises `insertIfAbsent(repository, doc)` with a plain mock object satisfying the `{ findById, create }` interface the function expects. No other modules are involved.

## Notes

- The repository is a **hand-built mock object**, not a class instance — no constructor or Mongoose model is needed. Adding new methods to the repository interface won't be caught here unless a test references them.
- The file uses top-level `it` blocks (no `describe` wrapper), consistent with the project's flat test style.
- The header comment records historical context: the `'skipped'` branch was previously unexercised by any unit because DB integration suites always seed into a dropped database, making idempotency invisible to coverage tooling.
