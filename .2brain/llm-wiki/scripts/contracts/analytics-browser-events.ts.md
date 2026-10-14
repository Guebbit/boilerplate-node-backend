---
source: scripts/contracts/analytics-browser-events.ts
sha256: 98f6b2046e00d7aceacae60636fa3bf85ac2f42fa3c9a5d76f041b6eaeb6a7cb
generated_at: 2026-10-14T07:08:10.937604+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/analytics-browser-events.ts

## Purpose

Assembles per-module browser-event schemas into the `analytics` service's `AnalyticsEventRequest` within a built OpenAPI bundle. Each module optionally ships a fragment file (`openapi.browser-events.yaml`); this step folds those schemas into the bundle and rewrites `AnalyticsEventRequest` into a discriminated `oneOf`, so that a module's contract leaves with the module.

## Key elements

- **`FRAGMENT_FILE`** — constant `'openapi.browser-events.yaml'`; the expected file name inside each module directory.
- **`REQUEST_SCHEMA`** — constant `'AnalyticsEventRequest'`; the schema in `analytics`'s OpenAPI that gets replaced.
- **`ROOT_REF_PREFIX`** — the `$ref` prefix fragments use to point at `shared/contracts/openapi.root.yaml`; stripped during localisation.
- **`FRAGMENT_ORDER`** — narrative ordering list (`['products']`); the rest are alphabetical.
- **`browserEventFragments(): string[]`** *(exported)* — scans `src/modules/*` on disk, returns absolute paths to every fragment that exists, ordered per `FRAGMENT_ORDER`.
- **`localiseReferences(node)`** — recursively rewrites `$ref` strings matching `ROOT_REF_PREFIX` into `#/components/schemas/…` form for the bundle.
- **`eventNameOf(name, schema)`** — validates that a schema's `properties.event.enum` is a single string and returns that string; throws otherwise.
- **`withBrowserEvents(bundled, fragments?)`** *(exported)* — parses the bundled YAML, merges each fragment's schemas, replaces `AnalyticsEventRequest` with a `oneOf` + `discriminator`, reorders so added schemas sit immediately after the request schema, and returns serialised YAML (`lineWidth: 0`). Returns input unchanged when `AnalyticsEventRequest` is absent or no fragments exist. Throws on duplicate schema names or event names across fragments.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — imports `REPO_ROOT` to locate the `src/modules` directory on disk.
- **`scripts/contracts/section-order.ts`** — imports `orderSections` to apply narrative-then-alphabetical ordering to discovered fragments.
- **`scripts/contracts/openapi-bundle.ts`** — the OpenAPI bundler that calls `withBrowserEvents` as a single step (per the file's doc comment).
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — unit tests for `browserEventFragments` and `withBrowserEvents`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-testing wave that exercises this file's logic.

## Notes

- The function returns the **original string unmodified** (not a re-serialised version) when there is nothing to add, preserving any existing formatting.
- Schema insertion is positional: added event schemas are spliced immediately after `AnalyticsEventRequest` in the output object, not appended at the end.
- `localiseReferences` handles **only** refs that start with the exact `ROOT_REF_PREFIX` constant; any other `$ref` values (e.g. internal `#/…` refs already in a fragment) pass through untouched.
- The `event` discriminator mapping is keyed by event-name string → `#/components/schemas/<SchemaName>`; a second fragment declaring the same event name is a hard error.
