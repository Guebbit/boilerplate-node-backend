---
source: tests/cross-cutting/replace-patch-parity.test.ts
sha256: 2aa04049b33330c93f129689f579dd14830dc4b5e2e0bd5e653c1dae0ecc19a8
generated_at: 2026-10-29T06:49:17.669069+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/replace-patch-parity.test.ts

## Purpose

Guarantees that every factory-backed resource's `Replace<Entity>Request` and `Update<Entity>Request` schemas declare the **same set of writable property names**. The shared `createUpdateController` factory only works because the two shapes are identical apart from `required`; a field added to one schema and forgotten on the other is invisible in either fragment in isolation. The test reads the per-module `openapi.yaml` fragments directly (not the generated bundle) so a mismatch is reported at the line a developer actually edits.

## Key elements

- **`SchemaShape`** (interface) — one schema component's declared property names, tagged with the module fragment it came from.
- **`REPLACE_OR_UPDATE`** (regex) — matches `Replace<Entity>Request` / `Update<Entity>Request`; the capture group isolates the entity name for pairing.
- **`schemas()`** — walks every module directory under `MODULES_ROOT`, parses its `openapi.yaml`, and returns a flat list of `{ module, name, properties: Set<string> }`.
- **`pairedSchemas()`** — groups schemas by entity via the regex; keeps only entries where **both** verbs declared a schema (a lone `Replace*` with no `Update*` counterpart is dropped so it cannot masquerade as a passing pair).
- **Test 1 — "canary against an empty sweep"** — asserts the *exact* set of paired entity names (filtered by `isDeployed`) matches a hard-coded `known` map. Catches a silent naming drift that would shrink the sweep to zero.
- **Test 2 — "same property names on both verbs"** — for every pair, asserts the `properties` sets are identical; reports which properties exist only on one side.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT` (directory to scan for module fragments) and `isDeployed` (filters the expected pair set by deployment status).
- **`package.json`** — supplies the `yaml` and `node:fs`/`node:path` runtime dependencies the test imports.

## Notes

- The `known` map in the canary test must be updated whenever a resource moves onto the factory (a new entity entry) or is removed. The assertion is `toEqual` on a **sorted** array, not a length check, so an extra or missing pair both fail.
- Schemas are read from **per-module fragments**, not the merged bundle, so a failure points at the file a developer edits (see the comment referencing `contract-error-declarations.test.ts`).
- Multipart request schemas are intentionally excluded: the factory validates the JSON-shaped schema for both content types, so the parity guarantee applies to the JSON shape.
- Only pairs where **both** verbs exist are checked. A lone schema (e.g., a `Replace` with no `Update`) is dropped by `pairedSchemas()` rather than compared against `undefined`, preventing a false pass.
