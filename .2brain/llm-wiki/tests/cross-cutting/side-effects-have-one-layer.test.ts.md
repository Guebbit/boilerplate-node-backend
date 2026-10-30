---
source: tests/cross-cutting/side-effects-have-one-layer.test.ts
sha256: b1381cf074a6426b9c52c81bb545715aa79924161af93e6cf2fc74f49fcc1397
generated_at: 2026-10-29T06:50:14.426142+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

Cross-cutting test that enforces a single architectural invariant no per-file lint rule can express: each of the four domain side-effect emissions (`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, `emitDomainEvent`) must be called from exactly one layer (the service layer), and every departure from that rule must be explicitly named with a justification. It exists because the violation is a property of the *set* of call sites across the codebase, not of any individual file.

## Key elements

- **`Layer`** — string-literal union classifying files into architectural layers (`controller`, `service`, `repository`, `model`, `routes`, `domain`, `other`).
- **`moduleFiles()`** — recursively walks `MODULES_ROOT` (from `@tests/paths`) collecting every `.ts` file, skipping `tests/` subdirectories.
- **`layerOf(file)`** — maps a file path to its `Layer` by inspecting the directory/file name relative to the module root. Treats a bare `service.ts` and a `services/` folder as the same layer.
- **`label(file)`** — produces the `<module>/<subpath>` string used in failure messages and the allowlist keys.
- **`EXPECTED_LAYER`** — the intention table: all four markers are declared to belong to `'service'`. Written as a fixed value, not derived from current code, so it asserts rather than measures.
- **`ALLOWED_ELSEWHERE`** — keyed `<marker> @ <file>` with a one-sentence justification. Currently holds two entries for `account/session/login-observability.ts` (audit + analytics for login outcomes that never reach a service).
- **`callSites()`** — scans every module file's source text (comments stripped) with a word-boundary regex for each marker, returning a `Map<marker, {file, layer}[]>`.
- **Test suite (4 `it` blocks)**:
  1. *Canary* — asserts the sweep actually found call sites (guards against a silently broken regex).
  2. *Main assertion* — collects "strays" (call sites whose layer ≠ expected AND not in the allowlist) and asserts the list is empty.
  3. *Stale-exception check* — asserts every key in `ALLOWED_ELSEWHERE` still corresponds to a live call site.
  4. *Table integrity* — asserts every layer value in `EXPECTED_LAYER` is a valid `Layer` member.

## Relationships

- **`tests/support/paths.ts`** — imports `isDeployed` and `MODULES_ROOT`. `MODULES_ROOT` defines the root directory the test scans; `isDeployed('orders')` gates the `emitDomainEvent` canary so the test passes in environments where the `orders` module is not present.

## Notes

- The scan is **textual, not AST-based**: it strips block comments (`/* … */`) and line comments (`// …`) with regex, then matches `marker\s*\(` with a lookbehind `(?<![\w.])` to exclude imports and qualified calls. A renamed function will escape detection until the `EXPECTED_LAYER` key is updated.
- `ALLOWED_ELSEWHERE` keys are **compound** (`marker @ file`), so an exception for `recordAudit` in a given file does not implicitly cover `enqueueEmail` in the same file.
- The test intentionally does **not** ban all controller-layer emissions; it enforces a *singleton home layer* plus a closed, justified exception list.
- `service.ts` (file) and `services/` (directory) are the **same layer** by design — splitting into a folder is a size decision, not an architectural one.
- The canary test conditionally requires `emitDomainEvent` sites only when `isDeployed('orders')` is true, because domain events are specific to shop modules.
