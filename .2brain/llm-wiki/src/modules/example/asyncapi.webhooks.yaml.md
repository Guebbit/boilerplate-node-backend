---
source: src/modules/example/asyncapi.webhooks.yaml
source_sha256: af330962de19772e7b6cc4889723fc58658a9c88f54fab2fbfd715261b4ede7b
context_sha256: 47eb712080fec592a6a3e20fa9c8dad9e57a8ce6406976fccfb0dc194d41cf46
generated_at: 2026-11-22T05:06:26.289842+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/asyncapi.webhooks.yaml

## Purpose
AsyncAPI fragment declaring the `example` module's single webhook event, `example.published`. It exists so the webhook contract lives with the module and is a copyable template for other modules. It is a fragment, not a standalone document.

## Key elements
- **Channel `example.published`** (`x-read-rule: public`): sent to the `#/servers/subscriberEndpoint` server, carrying the `ExamplePublishedEvent` message.
- **Operation `webhookExamplePublished`** (`action: send`): one-to-one with the `example.published` domain event (`src/modules/example/services/crud.ts`). Fires every time an example moves to `published`, including after being archived and restored.
- **Message `ExamplePublishedEvent`**: headers are `#/components/schemas/WebhookHeaders`; payload is `ExamplePublishedEnvelope`.
- **Schema `ExamplePublishedEnvelope`**: Standard Webhooks envelope `{ type, timestamp, data }`. `type` is the enum `example.published` (titled `ExamplePublishedEventType`), `timestamp` is a `date-time` string, and `data` is `ExamplePublishedPayload`. No additional properties.
- **Schema `ExamplePublishedPayload`**: required `exampleId` (refs `#/components/schemas/Id`) and `title` (the fallback-language title). No additional properties.

## Relationships
- `src/modules/delivery/asyncapi.webhooks.yaml` is a sibling fragment of the same kind, merged into the same `webhooks` section by the bundler. This file's content does not reference it directly.

## Notes
- The fragment's refs to `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` are resolved by the document it is merged into, not defined here. `#/components/schemas/Id` is likewise referenced but not defined here.
- Per the file's comments, the bundler merges it into the `webhooks` section only while the module exists, and `GET /webhooks/events` lists its event only while the module is registered. Deleting the module removes its events from the contract.
- Per the file's comments, the module's `publicEvents` is what actually fires the event.
- The file's own comments describe it as the example to copy when adding a webhook for a new module.
- The operation's message ref points to the channel's message (`#/channels/example.published/messages/ExamplePublishedEvent`), not directly to `components`.
