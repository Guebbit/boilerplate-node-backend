---
source: src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts
source_sha256: 3f8da699220cbda62d6e4a2bd4a1383094c92e416f3e56b4a6e9ed010b72520d
context_sha256: 5338b56d019e83a84ec645713b7a7014651effbe2914b044889685f305809386
generated_at: 2026-11-22T05:28:52.463986+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts

## Purpose
A compile-time test asserting that `inventoryService.receive` and `inventoryService.adjust` cannot be called without a caller argument. The module doc states that these methods move stock, so each must name the caller who answers for it, and that the audit row is written against that caller.

## Key elements
- `describe('a stock write names who made it')`: the single test suite.
- `it('is refused by the compiler when the caller is left out')`: builds an array of two arrow functions, one calling `receive('64b6…', 1, 'delivery note')` and one calling `adjust('64b6…', -1, 'stocktake')`, both without a caller.
- `// @ts-expect-error` on each call: the real assertion. If the caller parameter became optional, the directive would be unused and the type check would fail.
- `expect(attempts).toHaveLength(2)`: a runtime check that keeps the test valid. The functions are never invoked.

## Relationships
- Imports `inventoryService` from `src/modules/inventory/services/index.ts` and exercises the type signatures of its `receive` and `adjust` methods. It does not execute them.

## Notes
- The test only verifies anything when type checking runs over it (for example `tsc` or ts-jest with diagnostics). If type errors are not enforced, it passes trivially.
- The comment in the file says the attempts are never called, so no database is reached.
- The test does not show what the caller parameter's type or position is. It only shows that omitting it is a type error.
