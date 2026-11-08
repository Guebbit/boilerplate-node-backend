---
source: tests/unit/scripts/testing/demo-module-names.test.ts
sha256: 751fdfe95b04f0f3bc0cc5e167f4b28b6948b2fe40256ad0df336630f90e2889
generated_at: 2026-11-08T10:43:19.858966+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/demo-module-names.test.ts

## Purpose

Unit test for `readDemoModuleNames`. It builds a throwaway directory tree containing `src/modules/<name>/module.yaml` descriptors and asserts that the function returns only `shop` and `example` group modules, excluding `foundation` group ones.

## Key elements

- **`moduleOf(name, group)`** – local helper that creates `src/modules/<name>/module.yaml` inside the temp root with a fixed set of fields (`summary`, `subdomain`, `group`, `dependsOn`).
- **`beforeEach` / `afterEach`** – set up and tear down an isolated temp directory (`mkdtempSync` / `rmSync`), so tests never touch the real repo tree.
- **`describe('readDemoModuleNames')`** – single `it` block: creates four modules (`users`/foundation, `orders`/shop, `example`/example, `cart`/shop), then expects `readDemoModuleNames(root)` (sorted) to equal `['cart', 'example', 'orders']`.

## Relationships

- **`scripts/testing/demo-module-names.ts`** – the module under test; this file imports `readDemoModuleNames` from it and drives it with the temp fixture tree.

## Notes

- Uses `Array.prototype.toSorted()` (immutable, ES2023+) rather than mutating the result.
- The `module.yaml` content is minimal but must include the `group` field; the test does not exercise other descriptor fields, so the function's behavior with missing or differently-shaped YAML is not covered here.
- Only one test case exists; edge cases (empty modules dir, missing `module.yaml`, nested groups) are not asserted in this file.
