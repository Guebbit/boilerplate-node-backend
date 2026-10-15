---
source: src/modules/cart/tests/unit/stock-rule.test.ts
sha256: 6774bde8c574399ca57a73d36af50c37a0c88b1df24c16b1acf164df88c546fc
generated_at: 2026-10-15T10:26:12.216425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/stock-rule.test.ts

## Purpose

Unit test for the `fitsStock` stock rule in the cart domain layer. It verifies the boundary conditions of `fitsStock` (including zero and unknown availability) and cross-checks its verdict against `evaluateCheckout` to guarantee the checkout gate and the cart view never disagree on whether a quantity fits.

## Key elements

- **`describe('fitsStock')`** – sole test suite in the file.
- **Parameterized fit table** (`it.each`) – five `{quantity, available, fits}` tuples covering in-bounds, exact-match, over-stock, zero-availability, and zero-quantity cases.
- **Unknown-availability guard** (`it('fits nothing…')`) – asserts `fitsStock` returns `false` when `available` is `null` or `undefined`.
- **Checkout-agreement sweep** (`it.each([0,1,4,5,6])`) – builds a one-line cart with quantity 5 and varying availability, calls `evaluateCheckout`, and asserts its `verdict.ok` equals `fitsStock(5, available)` for every value.

## Relationships

- **`src/modules/cart/domain/index.ts`** – the single import source (`import { evaluateCheckout, fitsStock } from '../../domain'`). This barrel file re-exports the two functions under test.
- **`src/modules/cart/domain/stock.ts`** – presumed home of `fitsStock` (re-exported via the barrel).
- **`src/modules/cart/domain/rules.ts`** – presumed home of `evaluateCheckout` (re-exported via the barrel).

The test file itself exports nothing; it is a leaf in the dependency graph.

## Notes

- The file explicitly states "No mocks, no database" in its module doc-comment—these tests run against the real domain functions with plain data objects only.
- The cross-validation test uses a minimal cart shape (`{ productId, quantity, product: { title, available } }`). If that shape changes in the domain, this test will break even though `fitsStock` itself is unchanged.
- `fitsStock(0, 0)` is expected to return `true` (zero quantity always fits), which is a deliberate domain convention rather than an accident.
