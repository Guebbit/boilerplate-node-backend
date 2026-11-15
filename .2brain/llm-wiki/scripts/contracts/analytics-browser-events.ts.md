---
source: scripts/contracts/analytics-browser-events.ts
sha256: 7b743c68a3fc1592c58069b8779463c11bf0f9a9bb204722c4742eb5a11d9bdc
generated_at: 2026-11-14T17:22:02.406313+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/analytics-browser-events.ts

## Purpose

Discovers per-module browser-event OpenAPI fragments from disk and folds them into the `analytics` service's `AnalyticsEventRequest` schema, replacing it with a `oneOf` discriminated union on the `event` property. It exists so each module's browser-event contract lives alongside that module on disk, and the OpenAPI bundler needs only a single call (`withBrowserEvents`) to incorporate them.

## Key elements

- **`FRAGMENT_FILE`** — constant; the file name a module ships (`openapi.browser-events.yaml`).
- **`REQUEST_SCHEMA`** — constant; the target schema name in `analytics` (`AnalyticsEventRequest`).
- **`FRAGMENT_ORDER`** — narrative ordering list (`['products']`); remaining fragments sort alphabetically.
- **`browserEventFragments()`** — exported; discovers which modules ship the fragment (via `modulesWith`) and returns their absolute paths in the prescribed order.
- **`localiseReferences()`** — internal; recursively rewrites `$ref` strings that point at the root OpenAPI file into bundle-local `#/...` form.
- **`eventNameOf()`** — internal; reads the single enum value of a schema's `event` property; throws if it is not a one-value string enum.
- **`withBrowserEvents()`** — exported; main entry point. Reads each fragment, validates event names for uniqueness, localises refs, and rebuilds `components.schemas` so the event schemas sit immediately after `AnalyticsEventRequest` (now a `oneOf` + `discriminator`). No-ops if `analytics` is absent or no fragments exist.

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `readOpenApiFragment`, used to parse each fragment YAML into a components-only object.
- **`scripts/contracts/openapi-document.ts`** — provides the `OpenApiDocument` type (the bundled document `withBrowserEvents` mutates).
- **`scripts/contracts/section-order.ts`** — provides `orderSections`, used to apply narrative-then-alphabetic ordering to the fragment list.
- **`scripts/modules-on-disk.ts`** — provides `MODULES_ROOT` and `modulesWith`, used to discover which modules ship the fragment file.
- **`scripts/contracts/openapi-bundle.ts`** — the OpenAPI bundler that calls `withBrowserEvents` as part of its build pipeline.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — unit tests covering discovery, validation, and schema assembly.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises this file in a broader CI mutation context.

## Notes

- Fragments are **components-only** (no `paths`, `info`, etc.); `readOpenApiFragment` enforces that shape.
- Each schema in a fragment must declare `event` as a **one-value string enum**; otherwise `eventNameOf` throws. Duplicate schema names or event names across fragments also throw.
- The `schemas` map is **rebuilt** (not mutated in place) so the new event schemas are positioned immediately after `AnalyticsEventRequest`, preserving a readable narrative order.
- If `analytics` is missing from the bundle, `withBrowserEvents` is a silent no-op — the placeholder in `analytics/openapi.yaml` is left untouched.
- Follows the same "module owns its contract" principle as `asyncapi-webhook-events.ts` / `asyncapi-section-fragments.ts`.
