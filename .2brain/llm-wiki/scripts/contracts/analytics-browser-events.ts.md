---
source: scripts/contracts/analytics-browser-events.ts
sha256: 86465180d1f0d7dba50c4d785cd835d6f7184babb31d2bb540b1664326110492
generated_at: 2026-11-08T02:38:06.335868+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/analytics-browser-events.ts

## Purpose

Folds module-owned browser-event schemas (from `openapi.browser-events.yaml` fragments) into the `analytics` OpenAPI document, replacing the `AnalyticsEventRequest` placeholder with a `oneOf` discriminated union keyed on the `event` property. It exists as a separate module so the OpenAPI bundler can invoke it in a single call (`withBrowserEvents`) after the base bundle is assembled.

## Key elements

- **`FRAGMENT_FILE`** (`'openapi.browser-events.yaml'`) — the file name a module must ship to opt in.
- **`REQUEST_SCHEMA`** (`'AnalyticsEventRequest'`) — the target schema in the `analytics` document that gets replaced.
- **`FRAGMENT_ORDER`** — narrative ordering list (`['products']`); remaining modules follow alphabetically.
- **`browserEventFragments()`** — discovers which modules on disk own the fragment file (via `modulesWith`) and returns their absolute paths in narrative-then-alphabetical order (via `orderSections`).
- **`localiseReferences(node)`** — recursively rewrites `$ref` strings that point to the shared root file (`../../../shared/contracts/openapi.root.yaml#…`) into the bundle-local `#/…` form.
- **`eventNameOf(name, schema)`** — reads the `event` property's single enum value; throws if the property is missing, `$ref`-ed, or has a different cardinality.
- **`withBrowserEvents(document_, fragments?)`** — the public entry point. No-ops when `analytics` schemas are absent or no fragments exist. Otherwise: parses each fragment, validates event names, localises refs, then rebuilds `components.schemas` so the new event schemas sit immediately after `AnalyticsEventRequest`, which is now a `oneOf` with a `discriminator` on `event`.

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `readOpenApiFragment`, used to parse each module's fragment YAML.
- **`scripts/contracts/openapi-document.ts`** — provides the `OpenApiDocument` type for the document parameter.
- **`scripts/contracts/section-order.ts`** — provides `orderSections` to sort discovered modules (narrative first, then alphabetical).
- **`scripts/modules-on-disk.ts`** — provides `MODULES_ROOT` and `modulesWith` for on-disk fragment discovery.
- **`scripts/contracts/openapi-bundle.ts`** — the bundler that calls `withBrowserEvents` as a post-bundle step.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — unit tests for this module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-wave tests that exercise this file in context.

## Notes

- **Schemas are spliced in, not appended.** `withBrowserEvents` rebuilds `components.schemas` via `flatMap` so the new event schemas land immediately after `AnalyticsEventRequest` rather than at the end of the object.
- **`localiseReferences` preserves the `#`.** The slice index is `ROOT_REF_PREFIX.length - 1`, keeping the leading `#` so the result is a valid internal reference.
- **`eventNameOf` rejects `$ref`-ed `event` properties.** If the `event` property is itself a `$ref`, the function treats it as having no inline enum and throws. Fragments must declare the event value inline.
- **Idempotent no-op.** If `analytics` is absent from the bundle, or no module ships the fragment, the function returns without modifying the document. The placeholder in `analytics/openapi.yaml` remains untouched.
- **Duplicate detection is two-level.** Both schema *names* and *event values* are checked across all fragments; a collision in either throws with the offending file in the message.
- Follows the same pattern as webhook events (`asyncapi-webhook-events.ts`): a module's contract travels with the module on disk.
