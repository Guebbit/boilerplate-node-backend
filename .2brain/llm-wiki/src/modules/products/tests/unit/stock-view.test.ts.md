---
source: src/modules/products/tests/unit/stock-view.test.ts
sha256: a6529016da8153f3427860c29a9af4eef99b4a44aeb485b864cdb0e35cdad2a0
generated_at: 2026-11-14T21:31:36.775639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock-view.test.ts

## Purpose

Unit tests for the stock-visibility contract in the products module: which caller roles may see raw stock counters (`onHand`, `reserved`, `available`) and what `redactStock` strips (or preserves) from a product when the caller lacks the `read:StockLevel` permission.

## Key elements

- **`product`** – module-level fixture: a fully populated `Product` (counters, flags, `NO_PRODUCT_ACTIONS`).
- **`describe('canSeeStock')`** – parameterised (`it.each`) role assertions: `manager`, `warehouse`, `admin` → `true`; `editor`, `support`, `customer`, `unverified` → `false`. Also covers `strangerCaller()` and `undefined` → `false`.
- **`describe('redactStock')`** – four cases:
  - Identity passthrough when `canSeeStock` is `true` (same reference, `toBe`).
  - Counter removal + flag/field retention when `false` (`toEqual` on a copy missing `onHand`/`reserved`/`available`).
  - Non-mutation of the input object.
  - `editRevision` carried onto the redacted copy so the ETag survives (asserted via `versionOf`).

## Relationships

- **`src/modules/products/services/stock-view.ts`** – the system under test; imports `canSeeStock` and `redactStock`.
- **`tests/support/callers.ts`** – provides `callerAs(role)` and `strangerCaller()` to fabricate caller identities without hitting auth infrastructure.
- **`src/modules/products/domain/index.ts`** – the direct import target (`from '../../domain'`); re-exports `NO_PRODUCT_ACTIONS` to populate the fixture's `actions` field.
- **`src/modules/products/domain/actions.ts`** – the originating definition of `NO_PRODUCT_ACTIONS`, reached through the barrel in `domain/index.ts`.
- **`src/infrastructure/persistence/versioning.ts`** – exports `versionOf`, used to assert the revision number survives redaction.
- **`src/types/index.ts`** – supplies the `Product` type for the fixture.

## Notes

- `redactStock(product, true)` returns the **same reference** (`toBe`), while `redactStock(product, false)` returns a **new object** (`toEqual`). Downstream code can safely cache the un-redacted product but must treat the redacted result as a distinct allocation.
- The version-preservation test uses `editRevision` (not a `version` field) – the ETag mechanism reads whatever `versionOf` extracts, so the test only needs to confirm the numeric value is intact.
- Role list in the `it.each` table is the de-facto permission matrix; adding a new role that should *not* see stock requires a new row here.
