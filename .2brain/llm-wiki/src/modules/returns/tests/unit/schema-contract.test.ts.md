---
source: src/modules/returns/tests/unit/schema-contract.test.ts
sha256: a0c80446eee05f45f2589fbacc78284ae6bc41d57d1751b51ba7bf01c0e36b03
generated_at: 2026-11-08T08:13:32.183050+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/schema-contract.test.ts

## Purpose

Locks the structural contract of `returnSchema` so that accidental field additions, enum drift, default changes, or index removals are caught immediately. It exists as a living specification: the assertions *are* the requirements for what a return record must and must not contain.

## Key elements

- **`describe('returnSchema')`** — single suite with five tests covering the schema's full shape.
- **`requiredPaths` assertion** — pins the exact set of nine required fields (`currency`, `kind`, `lines`, `openedBy`, `orderId`, `orderNumber`, `reason`, `requestedAt`, `returnPostage`).
- **`userId` absence test** — asserts `returnSchema.path('userId')` is `undefined`, enforcing the "no person link" invariant.
- **`orderId` reference test** — confirms type `ObjectId` and ref target `Order`.
- **Defaults & enum tests** — pin `status` default (`'requested'`) and its six-value enum, `reason` enum (4 values), `returnPostage` enum (2 values), `kind` default (`'return'`) and its 2-value enum.
- **Index test** — asserts two compound indexes are declared: `returns_orderId_createdAt` and `returns_status_createdAt`.

## Relationships

- **`src/modules/returns/model.ts`** — source of the `returnSchema` under test; every assertion here constrains that model.
- **`tests/support/schema.ts`** — provides the introspection helpers (`enumOf`, `indexOptionSpecs`, `refOf`, `requiredPaths`, `typeOf`, `defaultOf`) that let the tests read schema metadata without re-implementing Mongoose traversal.

## Notes

- The module docstring cites GDPR Art. 17(3)(b)/(e): the deliberate absence of `userId` is what permits account-erasure jobs to leave return records untouched. Treat that assertion as a legal requirement, not a stylistic choice.
- Adding a new value to any enum in the model will break the corresponding `enumOf` assertion here; update both together.
- The index test checks for the *presence* of the two named indexes but does not assert that they are the *only* indexes — new indexes can be added without touching this file.
