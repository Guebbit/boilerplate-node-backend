---
source: src/modules/users/asyncapi.webhooks.yaml
sha256: 84837071cac16e09e041b8dbafd8b30901fc2fccd5380459481ef0f7e5ae42af
generated_at: 2026-11-14T22:18:52.106459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/asyncapi.webhooks.yaml

## Purpose

Declares the two webhook events that the users module emits (`user.erased`, `user.updated`). It is a **fragment**—not a standalone AsyncAPI document—that gets merged into the `webhooks` section of `src/modules/webhooks/asyncapi.yaml` by the contract bundler. Its existence lets the users module describe its outgoing events without duplicating shared servers or schemas.

## Key elements

- **`channels.user.erased`** / **`channels.user.updated`** — Channel definitions with `x-read-rule: read:User`, bound to the shared `subscriberEndpoint` server.
- **`operations.webhookUserErased`** / **`operations.webhookUserUpdated`** — `send` actions that pair each channel with its message.
- **`components.schemas.UserErasedEnvelope`** — Standard Webhooks envelope (`type`, `timestamp`, `data`); `data` is `UserIdPayload` (a single `userId`, `additionalProperties: false`).
- **`components.schemas.UserUpdatedEnvelope`** — Same envelope shape; `data` is `UserUpdatedPayload` carrying `userId` plus a `changed` array (field names only, min 1 item, enum of `username | email | phone | website | imageUrl`).
- **`components.messages.UserErasedEvent`** / **`UserUpdatedEvent`** — Message wrappers that reference `#/components/schemas/WebhookHeaders` (declared in the parent document) and the respective envelope schema.

## Relationships

- **`src/modules/webhooks/asyncapi.yaml`** — Parent document. This fragment `$ref`s its `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`. The bundler inlines this file's channels, operations, and components into that parent.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — The build-time script that discovers module fragments like this one and merges them into the parent AsyncAPI document only while the users module is present.
- **`src/modules/users/module.ts`** — Its `publicEvents` export is the runtime surface that fires the events documented here; this YAML describes that contract.
- **`src/modules/users/openapi.yaml`** — Sibling REST spec. Recipients use the API described there to refetch full account data after receiving an id-only webhook payload.
- **`docs/theory/data-protection.md`** — Cited as the rationale (GDPR Art. 19) for why payloads carry only `userId` and never a copy of personal data.

## Notes

- **Id-only payloads by design.** The erasure event carries nothing but `userId` so the delivery log never retains a fresh copy of an erased person's address. Recipients are expected to drop local copies on receipt.
- **`changed` is a name list, not a value list.** `UserUpdatedPayload.changed` enumerates *which* fields moved; it never includes the new values. Recipients must refetch via the REST API.
- **Not every mutation fires the update event.** Per the operation description, preference changes (locale, consent), the address book, and unconfirmed email-change requests do **not** trigger it.
- **`additionalProperties: false`** on every payload schema. Do not add fields to the payload without updating this fragment and the parent spec.
- **Fragment, not a document.** The `$ref` paths (`#/servers/…`, `#/components/schemas/WebhookHeaders`) resolve only after the bundler merges this file into `src/modules/webhooks/asyncapi.yaml`. Linting this file in isolation will report unresolved references.
