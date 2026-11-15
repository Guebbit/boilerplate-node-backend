---
source: src/modules/example/asyncapi.webhooks.yaml
sha256: af330962de19772e7b6cc4889723fc58658a9c88f54fab2fbfd715261b4ede7b
generated_at: 2026-11-14T19:56:16.354197+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/asyncapi.webhooks.yaml

## Purpose

AsyncAPI fragment that declares the `example` module's single webhook event (`example.published`) so it appears in the merged `webhooks` contract. It exists as a copyable template for other modules to model their own webhook events.

## Key elements

- **`channels.example.published`** — The sole webhook channel. Marks the event as `x-read-rule: public` and binds it to `#/servers/subscriberEndpoint`.
- **`operations.webhookExamplePublished`** — `send` operation describing the event; fires each time an example transitions to `published`, including re-publishing after archival.
- **`components.messages.ExamplePublishedEvent`** — Message definition; headers reference `#/components/schemas/WebhookHeaders` (declared in the parent contract), payload references the envelope below.
- **`components.schemas.ExamplePublishedEnvelope`** — Standard Webhooks envelope (`type`, `timestamp`, `data`); `type` is enum-locked to `"example.published"`.
- **`components.schemas.ExamplePublishedPayload`** — The `data` body: `exampleId` (ref to `#/components/schemas/Id`) and `title` (fallback-language string). `additionalProperties: false` on both schemas.

## Relationships

- **`src/modules/example/module.ts`** — The module's `publicEvents` export is what actually emits `example.published` at runtime. This YAML documents the wire shape; `module.ts` is the source of truth for when the event fires.
- **`src/modules/delivery/asyncapi.webhooks.yaml`** — Sibling fragment for the `delivery` module. Both are merged into the same `webhooks` section of the top-level contract; neither is a standalone AsyncAPI document.

## Notes

- This file is a **fragment**, not a document. It `$ref`s `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`, which live in the top-level `webhooks/asyncapi.yaml`. Opening it in a standalone AsyncAPI tool will show unresolved references.
- The bundler (`scripts/contracts/asyncapi-section-fragments.ts`) only includes this fragment while the `example` module is registered. Deleting the module removes the event from the published contract automatically.
- `GET /webhooks/events` lists this event only under the same condition (module registered).
- The event fires each time an example transitions to `published`, including re-publishing after archival — not only first-time publish.
