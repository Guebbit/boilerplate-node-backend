---
source: src/modules/example/asyncapi.domain-events.yaml
source_sha256: 2d881b586e2b8f5fb038c23745cbe68aff39a5e3329321b0b3248f6d0a0915f3
context_sha256: e1d6eca2b9b4ea3d0bf4af0278387ed25393e178b31597c53758b7bcd3213e6f
generated_at: 2026-11-22T05:06:14.739728+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment declaring the domain events emitted by the `example` module. It is merged into the `domain-events` section (`shared/contracts/asyncapi.domain-events.yaml`), is backend-only, and is a fragment rather than a standalone AsyncAPI document.

## Key elements
- **Channel `domain.example.published`** (address `example.published`): fires when an example moves to `published`, for the first time or after being archived. Marked `x-transport: outbox`. Carries the `ExamplePublishedDomainEvent` message.
- **Operation `domainExamplePublished`**: `action: send` on that channel, with the same summary.
- **Message `ExamplePublishedDomainEvent`** (title "Example published"): payload is `ExamplePublishedDomainEventPayload`.
- **Schema `ExamplePublishedDomainEventPayload`**: object with required string fields `exampleId`, `userId` and `title`; `additionalProperties: false`.

## Relationships
- `src/modules/delivery/asyncapi.domain-events.yaml` follows the same fragment pattern for the delivery module. Both are merged into the shared `domain-events` contract.

## Notes
- The `$ref`s are local (`#/channels/...`, `#/components/...`), so they resolve only after merging into the shared document.
- The payload is closed (`additionalProperties: false`), so adding a field requires updating the schema.
- `x-transport: outbox` is a custom extension, which suggests outbox-based delivery. The file does not define how that works.
