---
source: tests/cross-cutting/replace-patch-parity.test.ts
sha256: 90e3fad93a3e5e4fac2395221dc7ab5fb30c81b9c2d74e5a85d72a5aa12c9b7b
generated_at: 2026-11-14T23:07:07.501206+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/replace-patch-parity.test.ts

## Purpose

Guarantees that the `Replace<Entity>Request` (PUT) and `Update<Entity>Request` (PATCH) schemas for every factory-backed resource declare the **same set of property names**. A field added to one schema but forgotten on the other is independently valid YAML in both files, so no per-module check catches it; this cross-cutting test fills that gap.

## Key elements

- **`SchemaShape`** (interface) — `{ module, name, properties: Set<string> }`, a single `components.schemas` entry reduced to its declared property names.
- **`REPLACE_OR_UPDATE`** (regex constant) — matches `Replace<Entity>Request` or `Update<Entity>Request` and captures the shared entity name.
- **`schemas()`** — walks `MODULES_ROOT`, reads each module's `openapi.yaml` fragment, and returns every schema's property set.
- **`pairedSchemas()`** — groups the above by entity name; keeps **only** entities where exactly one `Replace*` and one `Update*` exist (a lone schema is dropped, not treated as a pass).
- **Canary test** (`finds exactly the known Replace/Update pairs`) — asserts the paired set equals an explicit `known` map filtered by `isDeployed`, catching a silent regex/naming drift that would make the parity test vacuously pass.
- **Parity test** (`declares the same property names…`) — for every pair, diffs the two property sets and reports which properties exist on only one side.

## Relationships

- **`tests/support/paths.ts`** — imported as `@tests/paths`; supplies `MODULES_ROOT` (the directory scanned for per-module fragments) and `isDeployed(module)` (filters the expected-pairs canary to modules that are actually deployed).
- **`tests/cross-cutting/validation-attributes.test.ts`** — sibling cross-cutting test in the same directory; both enforce cross-module schema invariants by reading per-module fragments rather than the merged bundle.

## Notes

- **Fragments, not bundle.** The test deliberately reads each module's own `openapi.yaml`. The merged/bundled spec would make a failure point to a generated line that nobody edits.
- **Exact-set canary.** The first assertion uses `toEqual` on a fully enumerated list, not `>= N`. A resource whose naming drifts out of the regex would otherwise shrink the sweep to zero and let the parity test pass vacuously.
- **Adding a resource.** When a new entity moves onto `createUpdateController`, its name must be added to the `known` map or the canary will fail.
- **Multipart is out of scope.** The factory validates the JSON-shaped schema for both content types, so multipart-only fields are intentionally not compared here.
- **`isDeployed` coupling.** If a module is removed from deployment, the expected pair set shrinks accordingly — the test won't fail on a missing module, only on a property mismatch among the modules that are present.
