---
source: src/modules/example/asyncapi.webhooks.yaml
sha256: cda9d97e876c0a828fca6816589b92bbdfcf30c731d05748960558ad745768bf
generated_at: 2026-11-08T05:47:47.194317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/asyncapi.webhooks.yaml

## Purpose

AsyncAPI fragment that declares the `example.published` webhook event for the example module. It is a **fragment**, not a standalone document: it references `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` that live in the root `webhooks/asyncapi.yaml`. The bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges this file into the `webhooks` section only while the example module is registered. Deleting the module removes its events from the contract.

## Key elements

- **`channels.example.published`** — The single channel; address `example.published`, bound to `#/servers/subscriberEndpoint`.
- **`operations.webhookExamplePublished`** — `action: send` on that channel; documents the one-to-one relationship with the `example.published` domain event in `example/services/crud.ts`.
- **`components.messages.ExamplePublishedEvent`** — Message definition carrying `WebhookHeaders` + the `ExamplePublishedEnvelope` payload.
- **`components.schemas.ExamplePublishedEnvelope`** — Standard Webhooks envelope: `{ type: "example.published", timestamp, data }`.
- **`components.schemas.ExamplePublishedPayload`** — The `data` body: `exampleId` (Id ref) and `title` (fallback-language string), no additional properties.

## Relationships

- **`src/modules/example/module.ts`** — Its `publicEvents` export is the runtime code that actually fires this webhook. This YAML file is the *contract*; `module.ts` is the *emitter*.
- **`src/modules/delivery/asyncapi.webhooks.yaml`** — A sibling fragment for the delivery module following the same pattern (fragment merged by the same bundler script). Useful as a second reference when modifying the fragment conventions.

## Notes

- This file **cannot be validated in isolation** — the `$ref`s to `#/servers/…` and `#/components/schemas/WebhookHeaders` resolve only after the bundler merges it into the root AsyncAPI document.
- The `ExamplePublishedEvent` fires on every transition to `published`, including re-publishing after archive.
- The envelope `type` field is a closed enum (`["example.published"]`), not a free-form string.
- Conventions to copy into a new module: keep the fragment minimal, reference shared headers/server from the root doc, and name the operation `webhook<EventPascalCase>`.
