---
source: tests/unit/scenarios/seed.test.ts
sha256: 4b56096531f77d56dffd29418590e93a1e890566012183012b52afacbed3c7df
generated_at: 2026-11-08T10:30:54.356996+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/seed.test.ts

## Purpose

Unit test for the `insertIfAbsent` policy function. It exercises **both** arms of the if-absent check (created / skipped) in isolation, ensuring the skip path—previously invisible to coverage because integration suites always seed into a fresh, dropped database—is now guaranteed to stay correct.

## Key elements

- **`FIXTURE`** — a single document literal with a pinned `Types.ObjectId` and a `name` field, shared by both test cases to simulate a known record.
- **`it('creates when no document carries the pinned id', …)`** — mocks `findById → null`; asserts `insertIfAbsent` resolves to `'created'` and calls `repository.create` with the fixture.
- **`it('skips when the id already exists — a second boot is a no-op, not a rewrite', …)`** — mocks `findById → FIXTURE`; asserts the return is `'skipped'` and that `create` is **not** invoked.

## Relationships

- **`scenarios/seed.ts`** — the module under test. This file imports its sole export, `insertIfAbsent(repository, doc)`, and drives it with a hand-built repository mock (no real DB).

## Notes

- The file's JSDoc block records *why* the skip arm was historically untested: every db integration suite seeds into a dropped database, so `findById` always resolved `null` and the skip branch never executed. This unit test was added specifically to close that coverage gap.
- Both tests use `jest.fn()` mocks for `findById` and `create`; no real Mongoose connection or fixture file is involved.
- The test file lives under `tests/unit/scenarios/` mirroring the source path `scenarios/seed.ts`, following the project's `tests/<layer>/<module>` convention.
