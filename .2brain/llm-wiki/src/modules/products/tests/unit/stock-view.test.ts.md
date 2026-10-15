---
source: src/modules/products/tests/unit/stock-view.test.ts
sha256: acfb94d1cd186a9157a057d22e3c0f03339372c5980f7f9f805e0c7f7a961710
generated_at: 2026-10-15T11:50:29.185047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock-view.test.ts

## Purpose

Unit tests for the `stock-view` service. Verifies the authorization gate (`canSeeStock`) so that only callers holding the literal `inventory.any.read` permission see exact stock counters, and verifies the redaction path (`redactStock`) which strips the three counters while preserving boolean flags, other fields, and the row's version for ETag purposes.

## Key elements

- **`product`** — a shared `Product` fixture carrying stock counters (`onHand`, `reserved`, `available`) and flags (`inStock`, `lowStock`).
- **`describe('canSeeStock')`** — table-driven test asserting `true` for `manager`, `warehouse`, `admin`; `false` for `editor`, `support`, `customer`, `unverified`, a stranger caller, and `undefined`.
- **`describe('redactStock')`** — four cases: (1) authorized caller receives the *same* object reference (`toBe`), (2) unauthorized caller gets a new object with the three counters removed, (3) the input fixture is never mutated, (4) `editRevision` is carried onto the copy so `versionOf` still yields the ETag value.

## Relationships

- **`src/modules/products/services/stock-view.ts`** — the unit under test; this file imports `canSeeStock` and `redactStock`.
- **`tests/support/callers.ts`** — provides `callerAs(role)` and `strangerCaller()` helpers used to fabricate caller identities for every test case.
- **`src/infrastructure/persistence/versioning.ts`** — provides `versionOf`, used in the ETag-preservation assertion.
- **`src/types/index.ts`** — supplies the `Product` type annotation for the fixture.

## Notes

- The authorized-case assertion uses `toBe` (reference identity), confirming `redactStock` short-circuits and returns the original object rather than a copy when the caller is permitted.
- The redaction test checks immutability by reading `product.onHand` *after* the call, not by snapshotting beforehand.
- Version propagation is exercised via a spread copy (`{ ...product, editRevision: 4 }`) rather than the base fixture, so the base fixture stays clean for other assertions.
- Role list in the `it.each` table is exhaustive over the known product keys; adding a new role key requires updating this table to keep coverage complete.
