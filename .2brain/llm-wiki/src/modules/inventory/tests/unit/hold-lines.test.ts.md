---
source: src/modules/inventory/tests/unit/hold-lines.test.ts
sha256: cd509468296e497319dc805e2d519a64d9a191e7b3bcfa4e8a28a6153b5f4f2a
generated_at: 2026-10-15T10:37:16.096583+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/hold-lines.test.ts

## Purpose

Unit tests for the `takeFromHold` pure function (the arithmetic of a partial shipment or cancelled remainder against an inventory hold). The file exists to pin down the function's exact input/output contract—especially the `kind`-aware behavior introduced with preorder claims—so that regressions are caught before they reach integration or e2e layers.

## Key elements

- **`describe('takeFromHold')`** — five tests covering the base (kind-less) contract: partial take per product, full drain, overtake capped at held quantity, unknown product yields empty `taken`, and duplicate product lines on either side are merged in the result. Also asserts **purity** (the input `hold` array is not mutated).
- **`describe('takeFromHold, with preorder claims')`** — five tests for the `kind: 'preorder'` dimension:
  - Kind isolation: taking a `preorder` line leaves shelf lines untouched and vice-versa.
  - A line without `kind` is always treated as shelf stock, never as a claim.
  - Fallback: a `preorder` request can be satisfied by shelf units that replaced the original claim (e.g., stock arrived and was allocated).
  - Priority: the claim is exhausted first; only the shortfall is drawn from shelf units.
  - One-way restriction: a shelf (kind-less) line can never consume a `preorder` line.
- **Shared fixtures** — `hold` (two products), `mixed` (same product on both shelf and preorder lines), and `allocated` (shelf-only). Defined inline per `describe` block.

## Relationships

- **`src/modules/inventory/domain/hold-lines.ts`** — Provides the `takeFromHold` function under test (re-exported via the domain barrel). All assertions in this file specify that function's behavioral contract.
- **`src/modules/inventory/domain/index.ts`** — The barrel module the test imports from (`import { takeFromHold } from '../../domain'`). Changing the re-export path or name here breaks this file's import.

## Notes

- Purity is an explicit contract: the "is pure" test snapshots the input before the call and compares after. Any refactor that mutates the caller's array will fail this test.
- The `kind` field is optional; its absence means **shelf**. Tests encode the asymmetry: shelf → claim is forbidden, claim → shelf fallback is allowed.
- Duplicate `productId` entries on either the hold side or the request side are merged in the result (single line per product in `remaining`/`taken`).
- Test fixtures use `as const` on `kind` to keep the literal type; omitting it would widen to `string` and mask type errors at the call site.
