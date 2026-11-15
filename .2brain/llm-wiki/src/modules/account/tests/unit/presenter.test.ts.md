---
source: src/modules/account/tests/unit/presenter.test.ts
sha256: 875ac0cf97a4ab7dee82b411113c97aaf87b4c7dc9e0b07c1fc698a8346aa973
generated_at: 2026-11-14T19:15:57.938638+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/presenter.test.ts

## Purpose

Unit tests for the account presenter's three wire-mapping functions. They verify that stored domain objects (`SessionRow`, export request rows) are shaped correctly for the API response and—critically—that the credential (`tokenHash`) never appears in the serialized output.

## Key elements

- **`row`** – A shared `SessionRow` stub (via `asStub`) that carries a `tokenHash` credential, so tests can assert it stays out of the wire shape.
- **`describe('presentSession')`** – Two cases: (1) happy-path mapping of `familyId → id`, dates, `device`, and the `current` flag (set by the third boolean argument); (2) that absent `lastUsedAt`/`device` are omitted from the result and the credential string is absent from `JSON.stringify` of the wire.
- **`describe('presentExportSession')`** – Confirms the wire uses the row's own `expiresAt` and does **not** include a `current` field (unlike `presentSession`).
- **`describe('presentExport')`** – Covers the export-request wire across three statuses (`building`, `ready`, `failed`): `id`/`createdAt`/`status` are always present; `expiresAt` appears only for `ready`; `actions.download` is `true` only for `ready`; `actions.request` is `false` when `building`, `true` otherwise.

## Relationships

- **`src/modules/account/presenter.ts`** – The module under test. This file imports and exercises `presentSession`, `presentExportSession`, and `presentExport`.
- **`src/modules/account/repository.ts`** – Source of the `SessionRow` type used to type the test stubs.
- **`tests/support/stub.ts`** – Provides `asStub<T>`, a helper that lets tests build a partial `T` with only the fields they care about while satisfying the type.

## Notes

- The security invariant "credential never reaches the wire" is pinned by a `JSON.stringify` containment check, not just a `toHaveProperty` absence check—this catches accidental nesting or renamed keys.
- `presentSession`'s `expiration` field is set from the **caller-supplied** date (second argument), whereas `presentExportSession` reads `expiresAt` off the row itself. This distinction is intentional and asserted separately.
- All date assertions use ISO-8601 strings with `.000Z` millisecond suffixes, matching `Date.prototype.toISOString()` output.
