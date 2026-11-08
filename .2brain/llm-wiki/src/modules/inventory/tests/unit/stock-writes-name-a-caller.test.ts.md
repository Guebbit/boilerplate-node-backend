---
source: src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts
sha256: 3f8da699220cbda62d6e4a2bd4a1383094c92e416f3e56b4a6e9ed010b72520d
generated_at: 2026-11-08T06:08:49.028972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts

## Purpose

Compile-time test that verifies `receive` and `adjust` on the inventory service **refuse** to be called without a caller identifier. It exists to pin down the type-level contract that every stock mutation must attribute itself to a named actor.

## Key elements

- **`describe('a stock write names who made it')`** — scopes the assertions to the caller-attribution rule.
- **`it('is refused by the compiler when the caller is left out')`** — builds two arrow-function wrappers that call `inventoryService.receive` and `inventoryService.adjust` with only three arguments (skipping the caller). Each call site is annotated with `@ts-expect-error`; the test passes only if the TypeScript compiler actually *errors* on those calls. The array `attempts` is never executed—its length is checked to satisfy the test runner.

## Relationships

- **`src/modules/inventory/services/index.ts`** — provides `inventoryService`, the object whose `receive` and `adjust` signatures are under test. The import is the sole runtime dependency of this file.

## Notes

- This is a **type-level** test, not a runtime one. The arrow functions are never invoked; no database call occurs. The `@ts-expect-error` directives are the assertion: if the type check ever starts *allowing* the omitted caller, the compiler removes the expected-error, and the test fails.
- The hex string `'64b64c4f4f4f4f4f4f4f4f4f'` stands in for a real inventory ID; its value is irrelevant since the function bodies never execute.
- Adding a new stock-writing method to the service means adding a matching `@ts-expect-error` line here to keep the contract covered.
