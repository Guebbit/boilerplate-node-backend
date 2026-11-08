---
source: tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts
sha256: eac128c8d23af8c17495be31b826bc507537f4cda87dd2be3faf34cad6730c89
generated_at: 2026-11-08T10:32:38.171907+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/asyncapi-webhook-events.test.ts

## Purpose

Unit tests that lock in the public contract of the AsyncAPI webhook event bundle: fragment ordering (shop modules first), channel-name uniqueness and ordering, and the invariant that all monetary fields in payload schemas reference a shared decimal-string schema rather than a raw number.

## Key elements

- **`describe('webhookEventFragments')`** — asserts that `webhookEventFragments()` returns module directories in the order `orders, delivery, payments, returns, example, users` (shop modules before generic ones).
- **`describe('webhookEventNames')`** — asserts that `webhookEventNames()` is a duplicate-free list ordered by fragment, and spot-checks specific channel names (`order.created`, `payment.refunded`).
- **`payloads()` (local helper)** — reads `asyncapi.public.yaml` from `REPO_ROOT`, filters `components.schemas` entries whose key ends with `Payload`, and returns `[schemaName, properties]` pairs.
- **`describe('the money in a webhook payload')`** — flattens every `amount` / `refundAmount` property across all payload schemas and asserts each references `#/components/schemas/NonNegativeDecimalAmount`. Includes a canary assertion (`money.length > 0`) to fail loudly if the bundle silently loses its money fields.

## Relationships

- **`scripts/contracts/asyncapi-webhook-events.ts`** — source of the two functions under test: `webhookEventFragments` and `webhookEventNames`.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, which this file uses to resolve the path to `asyncapi.public.yaml` at test time.

## Notes

- The money test does **not** import the schema from the contract module; it re-parses `asyncapi.public.yaml` from disk. If the YAML is renamed or moved, only this test breaks.
- The fragment-order assertion is brittle to inserting a new module directory without updating the expected array — it encodes the desired "shop-first" policy.
- `payloads()` uses a structural cast over the `yaml` parse result rather than a typed AsyncAPI model, so it will silently accept malformed YAML that still has the expected shape.
