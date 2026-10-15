---
source: scripts/contracts/analytics-browser-events.ts
sha256: 392ee6cef68ddf9b84f82079b6920c3f6554fb1e1182e78134eede93acef4b51
generated_at: 2026-10-15T09:35:01.930377+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/analytics-browser-events.ts

## Purpose

Folds module-owned browser-event YAML fragments into the bundled OpenAPI document. Each module that reports browser events ships a `components`-only fragment (`openapi.browser-events.yaml`); this step merges those schemas into the bundle and replaces the `AnalyticsEventRequest` placeholder with a `oneOf` discriminated on the `event` property. It exists as a separate file so the OpenAPI bundler can call it in a single step.

## Key elements

- **`browserEventFragments()`** (exported) — Discovers all modules that ship `openapi.browser-events.yaml` under `MODULES_ROOT`, returns absolute paths ordered by `FRAGMENT_ORDER` (narrative: `products`) then alphabetically.
- **`withBrowserEvents(bundled, fragments?)`** (exported) — Main entry point. Parses the bundled YAML, reads each fragment, validates each schema's `event` enum, localises root-file `$ref`s, inserts the new schemas immediately after `AnalyticsEventRequest`, and rewrites that schema as a `oneOf` + `discriminator`. Returns the bundle unchanged if `analytics` is absent or no fragments exist. Throws on duplicate schema names or event names.
- **`localiseReferences(node)`** — Recursively rewrites `$ref` strings starting with `../../../shared/contracts/openapi.root.yaml#` to the bundle-local `#/components/…` form.
- **`eventNameOf(name, schema)`** — Extracts the single string from a schema's `properties.event.enum`; throws if the enum is not exactly one string.
- **`FRAGMENT_FILE`**, **`REQUEST_SCHEMA`**, **`ROOT_REF_PREFIX`**, **`FRAGMENT_ORDER`** — Module-level constants controlling the file name, target schema, ref-rewrite prefix, and narrative ordering.

## Relationships

- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, used by `browserEventFragments()` to apply the `FRAGMENT_ORDER` narrative before alphabetical fallback.
- **`scripts/modules-on-disk.ts`** — Provides `MODULES_ROOT` and `modulesWith`, used to discover which modules on disk ship the fragment file.
- **`scripts/contracts/openapi-bundle.ts`** — The bundler that calls `withBrowserEvents` as one step in the assembly pipeline (this file is its consumer, not its dependency).
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — Unit tests exercising `withBrowserEvents`, `browserEventFragments`, and the validation/localisation helpers.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Mutation-testing CI wave that includes this file in its test coverage.

## Notes

- `stringifyYaml` is called with `lineWidth: 0` to suppress line-wrapping, keeping generated diffs minimal.
- New event schemas are inserted **immediately after** `AnalyticsEventRequest` in the output (rebuilt via `flatMap`), not appended at the end.
- If the `analytics` module is absent from the bundle, or zero fragments are found, the input string is returned untouched — no error.
- A fragment schema that does not declare `event` as a single-value string enum causes a hard `Error` at build time; there is no fallback or warning path.
