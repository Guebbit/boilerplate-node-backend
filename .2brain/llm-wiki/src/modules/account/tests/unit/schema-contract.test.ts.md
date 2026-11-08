---
source: src/modules/account/tests/unit/schema-contract.test.ts
sha256: dd3433d4c6bf48cb8fded06a75f83759ca87602cbbae56302ed3bd36e5b8638b
generated_at: 2026-11-08T04:49:25.285271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin the **declarative** (index, constraint, option) contracts of the account module's three Mongoose schemas — `accountExportSchema`, `sessionSchema`, and `verificationTokenSchema`. They exist because these database facts (unique indexes, TTL settings, partial filters) are invisible in a valid data fixture and would silently regress without an explicit assertion.

## Key elements

- **`describe('accountExportSchema')`** — asserts required paths, a unique index on `userId` (one live export per account), a non-unique `expiresAt` index for the reaper, and that no `expireAfterSeconds` option is present (the reaper must delete the row *and* its file together).
- **`describe('sessionSchema')`** — asserts required paths, a unique index on `tokenHash`, a TTL index on `purgeAt` with `expireAfterSeconds=0` (per-row date, so lifetime changes never rebuild the index), and a compound `userId_1_familyId_1` index.
- **`describe('verificationTokenSchema')`** — asserts required paths, a TTL index on `expiresAt` with `expireAfterSeconds=0`, and a **partial** unique index on `userId_1_type_1` that constrains only the token types limited to one live link (delete-confirmation, MFA-challenge types are excluded via `partialFilterExpression`).
- **Helper imports from `@tests/schema`** — `requiredPaths`, `pathOptions`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`: pure introspection utilities that extract declaration metadata from a schema object.

## Relationships

- **`src/modules/account/model.ts`** — source of the three schemas under test (`accountExportSchema`, `sessionSchema`, `verificationTokenSchema`). This file imports them directly; any rename or restructure in the model breaks this test.
- **`tests/support/schema.ts`** — provides the five introspection helpers (`requiredPaths`, `pathOptions`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`). This file depends on their exact signatures and return shapes (arrays of strings, objects with `unique`, `expireAfterSeconds`, etc.).

## Notes

- The file header deliberately calls the schemas "declarations, not documents" — the tests assert **what the database enforces**, not what a populated record looks like.
- `expireAfterSeconds: 0` is a non-obvious idiom: it means "expire at the value of the indexed date field," enabling per-row lifetimes without index rebuilds.
- The export schema's **absence** of a TTL index is intentional (documented inline): the reaper must atomically remove the row and its file, which a MongoDB TTL background thread cannot do.
- The verification-token unique index is **partial**; the test asserts the presence of `partialFilterExpression` to prevent someone from widening it to all token types.
