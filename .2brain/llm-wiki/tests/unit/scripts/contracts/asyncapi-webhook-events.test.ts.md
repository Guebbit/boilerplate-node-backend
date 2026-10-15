---
source: tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts
sha256: b3958d96cdbd814c1836e656ccb3bbd84028caeb24967bb8fe3195b9ab2be4e1
generated_at: 2026-10-15T13:25:47.214585+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts

## Purpose

Unit tests for the `scripts/contracts/asyncapi-webhook-events` module. They verify that webhook event fragments are discovered in a fixed order (shop modules before `example`) and that `withWebhookEvents` merges exactly one fragment per owner into the `webhooks` section while leaving all other sections untouched.

## Key elements

- **`emptySection()`** — local helper that returns a minimal parsed YAML document (`asyncapi: 3.0.0`) to stand in for any real section file, avoiding coupling to actual content.
- **`describe('webhookEventFragments')`** — asserts the returned file list, when reduced to its parent directory name, equals `['orders', 'delivery', 'payments', 'returns', 'example']` in that order.
- **`describe('withWebhookEvents')`** — two cases:
  - Passing `'webhooks'` as the section key calls the injected `merge` once per owner (same order) and returns the *same* document reference.
  - Passing any other key (e.g. `'observability'`) results in zero `merge` calls.

## Relationships

- **`scripts/contracts/asyncapi-webhook-events.ts`** — the module under test. Imports `webhookEventFragments` and `withWebhookEvents` directly.
- **`yaml`** — provides `parseDocument`, used solely to create the empty fixture document.

## Notes

- `merge` is always a `jest.fn()` mock; the tests assert *which owners* are merged and *in what order*, not what the merge actually does to the document.
- The ordering guarantee (shop modules before `example`) is the behavioral contract being locked in — if a new module is added, its position in the expected array must be updated here.
- `withWebhookEvents` is expected to be a strict no-op (no side effects, no merge calls) for any section key other than the literal string `'webhooks'`.
