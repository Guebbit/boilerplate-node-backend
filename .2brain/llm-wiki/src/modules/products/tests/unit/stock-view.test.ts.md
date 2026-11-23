---
source: src/modules/products/tests/unit/stock-view.test.ts
source_sha256: 486e3caa97ff4279c4aa8d0296e6dcbfc5530cb69355d3e63fc808d309cb46fc
context_sha256: 235f5cd1fef3c0bae44e41e5a77c478c53a0253bfc421de4feb189008501d5d4
generated_at: 2026-11-22T07:19:52.936160+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/stock-view.test.ts

## Purpose
Unit test for `canSeeStock`, the check that decides who may see exact stock counters. Per the module doc, only a caller holding `read:StockLevel`, read as the literal key, can see them. The test pins that rule down per role.

## Key elements
- `describe('canSeeStock')` with a parameterized `it.each` over role names:
  - `manager`, `warehouse`, `admin` → `true`
  - `editor`, `support`, `customer`, `unverified` → `false`. A comment notes these roles have every product key but not the stock one.
- A second test checks that `strangerCaller()` and `undefined` (no caller) both give `false`.

## Relationships
- `src/modules/products/services/stock-view.ts`: provides `canSeeStock`, the function under test (imported via a relative path).
- `tests/support/callers.ts`: supplies the `callerAs(role)` and `strangerCaller()` helpers to build callers. They are imported through the `@tests/callers` alias.

## Notes
- The roles that get `false` are the ones that hold other product permissions. This shows the stock permission is separate and is not implied by them.
- `undefined` is a supported input to `canSeeStock` and must be denied.
