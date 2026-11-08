---
source: src/modules/products/tests/unit/stock-view.test.ts
sha256: b58c8cfb9f87537c2a771975e13e3072f71745cf0fa884f928aaeec41185c888
generated_at: 2026-11-08T07:54:43.506929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock-view.test.ts

## Purpose

Unit tests for the `stock-view` service, verifying two behaviors: role-based visibility of exact stock counters (`canSeeStock`) and the redaction that strips those counters from a product object for unauthorized callers (`redactStock`).

## Key elements

- **`product` fixture** — A fully-populated `Product` literal (id, title, price, flags, and the three counters `onHand`/`reserved`/`available`) used as the input for both test suites.
- **`describe('canSeeStock')`** — Table-driven test asserting that `manager`, `warehouse`, and `admin` callers return `true`; `editor`, `support`, `customer`, `unverified`, a stranger, and `undefined` all return `false`.
- **`describe('redactStock')`** — Four tests covering:
  - Identity passthrough (`toBe`) when the caller is authorized.
  - Structural equality (`toEqual`) of the redacted copy: only the three counters are removed, all flags and other fields remain.
  - Immutability: the original `product` object is not mutated.
  - Version preservation: `editRevision` is carried into the redacted copy so the ETag survives.

## Relationships

- **`src/modules/products/services/stock-view.ts`** — The module under test; source of `canSeeStock` and `redactStock`.
- **`tests/support/callers.ts`** — Provides `callerAs(role)` and `strangerCaller()` to construct the caller identities used in the access-control tests.
- **`src/types/index.ts`** — Supplies the `Product` type annotation for the fixture.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `versionOf()`, used to assert that the `editRevision` value is preserved on the redacted copy.

## Notes

- The authorized-path assertion uses `toBe` (reference identity), confirming `redactStock` returns the *same* object rather than a copy when the caller is allowed to see stock.
- The version test reveals that "version" is stored as the `editRevision` field on the product and read through the `versionOf` helper — not a top-level `version` or `etag` property.
- `redactStock` is pure: it never mutates its input, always producing a new object for unauthorized callers.
