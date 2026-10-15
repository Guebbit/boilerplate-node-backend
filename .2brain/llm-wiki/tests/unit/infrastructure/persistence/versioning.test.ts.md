---
source: tests/unit/infrastructure/persistence/versioning.test.ts
sha256: 7eba8368dc90fa1a12273b4a816cf5b073a350d020ccf83b07bff755c001b82e
generated_at: 2026-10-15T13:18:51.964929+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/versioning.test.ts

## Purpose

Unit tests for the optimistic-concurrency helpers in `persistence/versioning`. The tests exercise the pure decision logic — accept, refuse, fence — against hand-built document shapes, deliberately avoiding Mongoose so the module's contract is verified in isolation from the ORM.

## Key elements

- **`versionOf` tests** — Confirm it reads `editRevision` as a number, ignores `updatedAt`, and returns `undefined` for missing, null, string, fractional, or `NaN` counters.
- **`carryVersion` tests** — Verify that a version is attached *beside* the reshaped object (readable by `versionOf`) without mutating the wire shape, and that it composes through multiple reshapes.
- **`etagOf` tests** — Confirm the numeric revision is rendered as a quoted strong entity-tag (`"7"`).
- **`fencedSave` tests** — The largest block. Covers:
  - No-op pass-through when no precondition is active or it names a different row.
  - Matching-tag acceptance: a `$where` fence (`{ editRevision: … }`) is applied to the document *during* the write and removed afterward (on both success and failure).
  - Unversioned rows fenced on `null` (Mongo matches a missing field).
  - Multiple-tag `If-Match` arrays; weak tags (`W/"7"`) are refused.
  - Stale-tag refusal (`PreconditionFailedError`, write never called).
  - Translation of Mongoose `DocumentNotFoundError` / `VersionError` into `PreconditionFailedError`; other errors pass through unchanged.
  - Only the **first** save in a sequence is precondition-checked.
- **`checkedDelete` tests** — Same precondition gate as `fencedSave`, plus:
  - The `$where` fence is applied and removed.
  - `deletedCount: 0` is a conflict **only** when a precondition was sent; without one it resolves normally.
- **Helper factories** — `loaded`, `unversioned`, `on` build minimal document/precondition fixtures without importing Mongoose.

## Relationships

- **`src/infrastructure/persistence/versioning.ts`** — Every function under test (`versionOf`, `carryVersion`, `etagOf`, `fencedSave`, `checkedDelete`, `PreconditionFailedError`, `runWithPrecondition`, `Precondition`) is imported from this single module. `runWithPrecondition` is used as an async-local context runner to simulate an active `If-Match` header around each write call. No other production module is imported.

## Notes

- The `$where` fence is a **temporary property** set on the document object during the write; tests assert it is deleted after the write settles (both resolve and reject paths). Do not expect it to persist.
- `runWithPrecondition` accepts `etags` as either an array of quoted tags **or** the string `'any'` (the `*` / match-anything case). Tests exercise both forms.
- "Checks only the first save" is an intentional design boundary: a second `fencedSave` call inside the same precondition scope is **not** re-checked, because its revision is one the caller never observed.
- Mongoose error objects are simulated via `Object.assign(new Error(), { name })` — the module under test only inspects the `name` property, so no real Mongoose driver is needed.
