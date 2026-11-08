---
source: scripts/contracts/asyncapi-webhook-events.ts
sha256: 182a9b062ac795844857f673cef7500932bc205ff8f55f90e60fce2ab5bfb26b
generated_at: 2026-11-08T02:39:01.000272+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-webhook-events.ts

## Purpose

Discovers and indexes the per-module `asyncapi.webhooks.yaml` fragments so that the AsyncAPI bundler can merge them into the `webhooks` section of the spec. Enforces the same "contract leaves with the module" principle as the OpenAPI side: a deployment that omits a given module automatically omits that module's webhook channels.

## Key elements

- **`WEBHOOKS_SECTION`** — constant `'webhooks'`; the AsyncAPI top-level key these fragments merge into.
- **`webhookEventFragments(): string[]`** — delegates to `sectionFragments(WEBHOOKS_SECTION)`; returns absolute file paths of every module's webhook fragment (shop modules first, then alphabetical).
- **`webhookEventNames(): string[]`** — reads each fragment, extracts the keys under `channels`, and returns them flat-mapped in fragment-then-channel order. Consumed by the REST contract to populate the `eventTypes` enum without duplicating the list.

## Relationships

- **`scripts/contracts/asyncapi-section-fragments.ts`** — provides the generic `sectionFragments(section)` discovery helper that this module calls; the file-level merge logic lives there, not here.
- **`scripts/contracts/openapi-bundle.ts`** — parallel concern on the OpenAPI side; both follow the same "module-owned fragment" fragmentation strategy (see `docs/api/contract-fragmentation.md`).
- **`tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts`** — unit tests exercising `webhookEventFragments` and `webhookEventNames`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-testing harness that exercises this module's logic in a broader pipeline context.

## Notes

- Fragment YAML is parsed with the `yaml` package (`parse`), not a YAML-with-custom-tags variant; the code assumes a plain-object shape with an optional top-level `channels` key. If a fragment omits `channels`, it contributes zero event names (the `?? {}` guard).
- Ordering matters: `webhookEventNames` preserves fragment order (shop modules first, then alphabetical) and, within each fragment, the insertion order of `Object.keys`. Downstream consumers (the REST enum) rely on this stable ordering.
- This file is deliberately thin; all file-system globbing and merge mechanics are in `asyncapi-section-fragments.ts`. Adding a new module's webhooks only requires dropping an `asyncapi.webhooks.yaml` into that module's directory—no import change here.
