---
source: scripts/contracts/analytics-browser-events.ts
generated_at: 2026-11-22T01:52:44.560942+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/analytics-browser-events.ts

## Purpose

Lets each module own the browser events its pages report, and assembles them into the `analytics` module's request schema in the bundled OpenAPI document. A module ships `src/modules/<m>/openapi.browser-events.yaml` (components only, one schema per event). After the bundle is built, this step adds those schemas and replaces `AnalyticsEventRequest` with a `oneOf` discriminated on `event`. It follows the same principle as the webhook events: a module's contract leaves with the module. It lives in its own file so the OpenAPI bundler needs only one call.

## Key elements

- `browserEventFragments()`: discovers every module's `openapi.browser-events.yaml` on disk via `modulesWith(MODULES_ROOT, ...)`. It returns absolute paths ordered by `FRAGMENT_ORDER` (`['products']` first), then alphabetically.
- `withBrowserEvents(document_, fragments?)`: the single entry point. It mutates the bundled document in place and defaults `fragments` to `browserEventFragments()`.
  - It returns without changes if `components.schemas` is missing, `AnalyticsEventRequest` is absent, or there are no fragments.
  - For each fragment schema it reads the event name, rejects duplicates, and rewrites root refs to local ones.
  - It then rebuilds `components.schemas` so the event schemas sit right after `AnalyticsEventRequest`.
  - `AnalyticsEventRequest` becomes `{ oneOf: [$ref...], discriminator: { propertyName: 'event', mapping } }`.
- `localiseReferences` (internal): recursively rewrites `$ref` values starting with the root-file prefix (`../../../shared/contracts/openapi.root.yaml#`, the path as a fragment spells it) into local `#/...` refs.
- `eventNameOf` (internal): returns the single string value of a schema's `event` enum. It throws if `event` is not a one-value string enum.
- Constants: `FRAGMENT_FILE`, `REQUEST_SCHEMA`, `ROOT_REF_PREFIX`, `FRAGMENT_ORDER`.

## Relationships

- `./fragments`: `readOpenApiFragment` parses each fragment file.
- `./section-order`: `orderSections` applies the narrative ordering to the discovered module names.
- `../modules-on-disk`: provides `MODULES_ROOT` and `modulesWith` for finding modules that ship the fragment file.
- `./openapi-document`: supplies the `OpenApiDocument` type of the document being mutated.
- `./openapi-bundle`: per the header comment, the OpenAPI bundler calls `withBrowserEvents` once after the bundle is built.
- `tests/unit/scripts/contracts/analytics-browser-events.test.ts`: the unit test for this module.
- `tests/unit/scripts/mutation/ci/waves.test.ts`: related through the dependency graph. No direct interaction is visible in this file.

## Notes

- Fragment schemas are typed `unknown` by the fragment reader, so they are cast to `Schema`. The code relies on `localiseReferences` preserving shape.
- Errors are thrown for a schema name already in the document or in another fragment, and for a duplicate event name. The message names the second file.
- The `!` on `document_.components!` is safe because `schemas` was read from `components`.
- When no fragment exists, the placeholder in `src/modules/analytics/openapi.yaml` stays.
- The header comment points to a contract-fragmentation doc section, "module-owned-browser-events".
