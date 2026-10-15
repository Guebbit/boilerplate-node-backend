---
source: tests/unit/scripts/testing/demo-module-names.test.ts
sha256: 751fdfe95b04f0f3bc0cc5e167f4b28b6948b2fe40256ad0df336630f90e2889
generated_at: 2026-10-15T13:32:14.245748+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/demo-module-names.test.ts

## Purpose

Unit test for `readDemoModuleNames`. It verifies that the function returns only modules whose `module.yaml` declares a `group` of `shop` or `example`, and excludes `foundation` modules.

## Key elements

- **`moduleOf(name, group)`** – local helper that creates `src/modules/<name>/module.yaml` inside the temp root with a minimal YAML body (summary, subdomain, group, empty dependsOn).
- **`beforeEach` / `afterEach`** – manage a per-test temporary directory (`os.tmpdir()` + `mkdtempSync`) so each test starts from a clean checkout layout and cleans up after itself.
- **`describe('readDemoModuleNames')`** – contains a single `it` that seeds four modules (`users/foundation`, `orders/shop`, `example/example`, `cart/shop`) and asserts the sorted result equals `['cart', 'example', 'orders']`.

## Relationships

- **`scripts/testing/demo-module-names.ts`** – the module under test; `readDemoModuleNames(root)` is the sole SUT called here. The test passes the temp directory as the `root` argument and inspects the returned name array.

## Notes

- The test relies on the convention that `root` must contain `src/modules/<name>/module.yaml` (not just `<name>/module.yaml`). Omitting the `src/modules/` prefix would cause `readDemoModuleNames` to find nothing.
- The YAML fixture is hardcoded as a template literal; if the real `module.yaml` schema changes (required keys, new fields), these fixtures may need updating even though the test only exercises `group`.
- The assertion uses `.toSorted()` (ES 2023 / TypeScript 5.6+ `Array.prototype.toSorted`) rather than mutating a copy — requires a compatible TS/lib target.
