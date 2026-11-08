---
source: tests/unit/infrastructure/persistence/versioning.test.ts
sha256: 7eba8368dc90fa1a12273b4a816cf5b073a350d020ccf83b07bff755c001b82e
generated_at: 2026-11-08T10:22:56.282421+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/versioning.test.ts

## Purpose
Unit tests for the row-versioning and write-precondition logic in `@infrastructure/persistence/versioning`. The suite exercises the pure decision logic (accept, refuse, fence) of `fencedSave`, `checkedDelete`, and their helpers without a Mongoose or database dependency — writes are mocked with `jest.fn()`.

## Key elements
- **`versionOf` tests** — verifies the counter is read from `editRevision`, that `updatedAt` is ignored, and that invalid values (string, float, `NaN`, `null`, `undefined`, missing) yield `undefined`.
- **`carryVersion` tests** — confirms a reshaped object still answers its source row's version, that the value rides *beside* the object (wire shape untouched), and that chaining a second reshaping preserves it.
- **`etagOf` tests** — single check that a numeric revision is returned as a quoted strong entity-tag (`"7"`).
- **`fencedSave` tests** — the largest block. Covers: no-precondition pass-through; precondition on a different row; matching-tag acceptance and fence injection (`$where` on the document); unversioned row fenced at `null`; fence removal after both success and failure; multi-tag acceptance; stale-tag refusal; weak-tag (`W/…`) refusal; unversioned row + `If-Match: *` acceptance; Mongoose `DocumentNotFoundError` / `VersionError` → `PreconditionFailedError`; unrelated errors passed through unchanged; and that only the *first* save in a sequence is precondition-checked.
- **`checkedDelete` tests** — stale-tag refusal; matching-tag and no-precondition deletion; fence injection and `deletedCount: 0` treated as a conflict *only* when a precondition was sent.
- **Helpers** — `loaded()`, `unversioned()`, and `on(...etags)` build fixture documents and `Precondition` objects scoped to `row-1`.

## Relationships
- **`src/infrastructure/persistence/versioning.ts`** — the sole subject under test. The file imports `carryVersion`, `checkedDelete`, `etagOf`, `fencedSave`, `PreconditionFailedError`, `runWithPrecondition`, `versionOf`, and the `Precondition` type from that module. No other production or test files are imported.

## Notes
- **Fence inspection via `Reflect.get(doc, '$where')`** — tests assert the fence *is* present while the write is in-flight and *is removed* once the write settles (both resolve and reject paths). This implies `fencedSave`/`checkedDelete` attach and then delete a `$where` property on the document object.
- **`runWithPrecondition` is always the outer context** — it establishes the precondition scope; `fencedSave` and `checkedDelete` read it via the ambient context rather than receiving it as an argument.
- **`etags: 'any'`** represents `If-Match: *` (HTTP semantics) and is the only way an unversioned row can pass a precondition check.
- **Weak etags (`W/` prefix) are always refused** — the comparison is strong-only, matching HTTP `If-Match` behaviour.
- **`REVISION = 7`** is the single shared fixture value; `row-1` is the canonical document ID throughout.
