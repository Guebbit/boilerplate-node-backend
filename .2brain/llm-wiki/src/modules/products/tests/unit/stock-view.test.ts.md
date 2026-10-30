---
source: src/modules/products/tests/unit/stock-view.test.ts
sha256: 1c72d8aa8b48795f1979a8b8153b3a36b0d94133649c0226dbc506e76bf35aa8
generated_at: 2026-10-29T05:35:20.900112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock-view.test.ts

## Purpose

Unit tests for the two public functions of the stock-view service (`canSeeStock`, `redactStock`). Validates the role-based gate for reading exact stock counters and the redaction contract that strips counters while preserving boolean flags, other fields, and the row's version.

## Key elements

- **`product`** – module-level fixture: a fully-populated `Product` (including `onHand`, `reserved`, `available`) used as the shared input object.
- **`describe('canSeeStock', …)`** – table-driven test asserting `true` for `manager`, `warehouse`, `admin`; `false` for `editor`, `support`, `customer`, `unverified`, a stranger caller, and `undefined`.
- **`describe('redactStock', …)`** – four cases:
  - *passthrough*: when allowed (`true`), returns the **same reference** (`toBe`).
  - *redaction*: when denied, the three counter fields are absent; flags and scalars remain (`toEqual` on a literal without counters).
  - *immutability*: the original `product` object is unmodified after a redact call.
  - *version survival*: a product carrying `editRevision: 4` still reports version `4` via `versionOf` on the redacted copy.

## Relationships

- **`src/modules/products/services/stock-view.ts`** – the unit under test; imports `canSeeStock` and `redactStock`.
- **`tests/support/callers.ts`** – provides `callerAs(role)` and `strangerCaller()` to build mock authorization callers without coupling to the real auth layer.
- **`src/infrastructure/persistence/versioning.ts`** – provides `versionOf` to assert that the ETag/edit-revision survives redaction.
- **`src/types/index.ts`** – supplies the `Product` type for the fixture.

## Notes

- The passthrough case uses reference equality (`toBe`), not structural equality—this is an intentional contract: no copy is made when the caller is authorized.
- The role matrix is hard-coded inline in the test rather than derived from a shared constants list; adding a new role requires updating both the service and this table.
- `editRevision` is the field name on the wire object, but the test reads it back through `versionOf`; the service's redaction logic must copy that field into the new object.
