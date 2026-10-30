---
source: src/modules/account/tests/unit/schema-contract.test.ts
sha256: dd3433d4c6bf48cb8fded06a75f83759ca87602cbbae56302ed3bd36e5b8638b
generated_at: 2026-10-29T03:05:45.509382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/schema-contract.test.ts

## Purpose

Verifies the *declarative* shape of the account module's three Mongoose schemas (export, session, verification token) — required fields, unique constraints, index definitions, and TTL semantics. These are "database facts" that a valid data fixture cannot express (e.g., a TTL that deletes a spent row), so the test asserts them directly against the schema objects.

## Key elements

- **`describe('accountExportSchema')`** — asserts five required paths, a `unique: true` on `userId` (one live export per account), a `expiresAt` index for the reaper's scan, absence of a TTL index (reaper deletes file + row together), and `timestamps: false`.
- **`describe('sessionSchema')`** — asserts seven required paths, `unique: true` on `tokenHash`, a TTL index on `purgeAt` with `expireAfterSeconds=0`, and a compound `{userId, familyId}` index.
- **`describe('verificationTokenSchema')`** — asserts five required paths, a TTL index on `expiresAt` (`expireAfterSeconds=0`), and a *partial* unique index on `{userId, type}` that constrains only link types allowing a single live link.
- **Helper imports** — `requiredPaths`, `pathOptions`, `indexSpecs`, `indexOptionSpecs`, `optionsOf` (all from `@tests/schema`) to interrogate the schema objects without instantiating documents.

## Relationships

- **`src/modules/account/model.ts`** — sole source of the three schema objects under test; this file imports `accountExportSchema`, `sessionSchema`, `verificationTokenSchema` directly.
- **`tests/support/schema.ts`** — provides the five introspection helpers used throughout; no other test in this file touches the database or creates collections.

## Notes

- Tests assert index specs as **string substrings** (e.g., `'expiresAt_1: expireAfterSeconds=0'`) rather than structured objects, so reordering or renaming an index field will break the test even if semantics are unchanged.
- The `unique: true` check on `userId` for `accountExportSchema` is a *conditional* uniqueness (one live export), not an unconditional one — the partial-filter logic lives in the schema definition, not re-stated here.
- `expireAfterSeconds=0` is Mongoose's "TTL anchored to the field's own value" mode; the comments explain why the export schema deliberately *omits* this (the reaper must delete the companion file atomically with the row).
