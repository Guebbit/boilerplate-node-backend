---
source: src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts
sha256: 3f8da699220cbda62d6e4a2bd4a1383094c92e416f3e56b4a6e9ed010b72520d
generated_at: 2026-10-29T04:09:27.918635+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/stock-writes-name-a-caller.test.ts

## Purpose

A compile-time contract test that verifies `inventoryService.receive` and `inventoryService.adjust` **refuse to type-check** when the required `caller` argument is omitted. The file exists to guard the invariant that every stock write is attributable to a named caller, enforced by the TypeScript type signature rather than a runtime check.

## Key elements

- **`describe('a stock write names who made it', …)`** — top-level suite; no setup or teardown.
- **`it('is refused by the compiler when the caller is left out', …)`** — the single test case. Builds an array of two arrow-function stubs that each call `receive` / `adjust` with one argument short (no `caller` string). Each call is annotated with `// @ts-expect-error`, so the file compiles only if the type signature actually rejects the missing parameter.
- **`expect(attempts).toHaveLength(2)`** — a minimal runtime assertion whose real role is to satisfy Jest (a `describe`/`it` body that contains no `expect` would fail). The functions are never invoked.

## Relationships

- **`src/modules/inventory/services/index.ts`** — the sole import (`inventoryService`). This test does not mock or spy on it; it relies purely on the exported type signatures to produce the expected compile-time errors.

## Notes

- This is a **compile-time test**: the meaningful assertion is `@ts-expect-error`. If someone makes `caller` optional (or removes the parameter), the `@ts-expect-error` annotations become *unused* and TypeScript will itself raise an error, failing the build.
- The stubs are intentionally never called; reaching the database is explicitly out of scope (as the inline comment states).
- The SKU-like hex string (`64b64c4f…`) and reason strings (`'delivery note'`, `'stocktake'`) are placeholders — their values are irrelevant because the calls never execute.
