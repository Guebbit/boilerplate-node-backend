---
source: src/modules/inventory/tests/unit/hold-lines.test.ts
sha256: 3ddf2a0269c927bf67f96dbec46cf05df4c7ff2de58543601cac2b7968306ddc
generated_at: 2026-11-08T06:08:15.466418+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/hold-lines.test.ts

## Purpose

Unit tests for the pure hold-line arithmetic (`takeFromHold`, `withAdded`) in the inventory domain. Covers partial extraction, over-asking, product deduplication, purity, and the two-kind (shelf vs. backorder/preorder claim) interaction rules.

## Key elements

- **`describe('takeFromHold')`** — verifies basic extraction: partial take per product, full drain, over-ask clamps to available, unknown product is a no-op, duplicate product lines are summed in both hold and request, and the input array is never mutated.
- **`describe('takeFromHold, with preorder claims')`** — verifies kind-aware extraction: a request scoped to `backorder` only touches backorder lines; a line with no `kind` is always shelf and never a claim; a backorder request may fall back onto shelf units that replaced its claim; claim units are consumed before shelf units; and a shelf request can never touch a claim line.
- **`describe('withAdded')`** — verifies merging: same-product/same-kind lines are summed; same-product/different-kind lines stay separate; an empty hold simply returns the added lines.

## Relationships

- **`src/modules/inventory/domain/hold-lines.ts`** — defines the two functions under test (`takeFromHold`, `withAdded`). This file is the sole spec for that module.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export through which the test imports those functions (`import { takeFromHold, withAdded } from '../../domain'`).

## Notes

- The `kind` field (e.g. `'backorder'`) is the discriminator between shelf stock and a preorder claim. Its absence means "shelf," and shelf lines can never satisfy a claim request.
- The "fall back" rule (backorder request consuming shelf units that replaced the claim) is an intentional asymmetry: shelf → claim is forbidden, claim → shelf is allowed.
- All tested functions are expected to be pure; the purity test deep-copies the hold before and asserts equality after.
