---
source: src/modules/products/tests/unit/preorder.test.ts
source_sha256: 6882cce9522dbf5c9b84ae475456b95f5ebd6c54f0662a9a22229ee78405c665
context_sha256: 8de69ff5ef2c512f4c86853af174bbc1ed4e5c5045f6751685c949ca8bdcf450
generated_at: 2026-11-22T07:19:19.248064+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/preorder.test.ts

## Purpose
Unit tests for the pure `isPreorder` and `latestReleaseDate` functions from the products domain. Every case runs against a fixed clock (`NOW`), so the date-based rules are deterministic.

## Key elements
- `NOW` (`2026-10-12T10:00:00.000Z`), `LATER` (`2026-12-01`), `EARLIER` (`2026-09-01`): fixed dates used as the reference instant and as future/past release dates.
- `describe('isPreorder')`: a table-driven `it.each` that calls `isPreorder(facts, NOW)`. Expected results:
  - **true**: a future `releaseDate` alone, or a future date with explicit `active: true` and `purchasable: true`.
  - **false**: no date, a past date, a date exactly equal to `NOW`, `active: false`, or `purchasable: false`.
- `describe('latestReleaseDate')`:
  - Returns the same instant one calendar year later (`2027-10-12T10:00:00.000Z` for `NOW`).
  - Does not mutate its argument; `NOW.getTime()` is unchanged after the call.

## Relationships
- Imports `isPreorder` and `latestReleaseDate` from `src/modules/products/domain/preorder.ts`, the only unit under test. The tests use no mocks or other dependencies.

## Notes
- Omitted `active` and `purchasable` flags are treated as allowing a preorder. The first case has neither flag, and it expects `true`.
- The boundary is strict: a release date equal to `NOW` is not a preorder.
