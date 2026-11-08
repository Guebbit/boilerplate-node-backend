---
source: src/modules/users/asyncapi.webhooks.yaml
sha256: c365f24d8479c8b5851970941fe9de2f178ce7b8081baca3bf69cdf4277b9c49
generated_at: 2026-11-08T08:42:56.927634+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/asyncapi.webhooks.yaml

## Purpose

AsyncAPI **fragment** (not a standalone document) that declares the two webhook events emitted by the users module — `user.erased` and `user.updated`. It exists so that a global AsyncAPI document can be assembled by merging module-level fragments, and so that the event contract (envelope shape, field enums, firing conditions) is documented alongside the code that fires it.

## Key elements

- **Channels** — `user.erased` and `user.updated`; each binds to the shared `subscriberEndpoint` server and references its message component.
- **Operations** — `webhookUserErased` and `webhookUserUpdated`; both are `send` actions. Their `description` fields document *when* each fires (transaction boundaries, what is excluded) and the GDPR rationale for the id-only payload.
- **`components.messages`** — `UserErasedEvent` and `UserUpdatedEvent`; each carries `WebhookHeaders` (defined externally) plus a typed envelope payload.
- **`components.schemas`**
  - `UserIdPayload` — `{ userId }`, the entire `user.erased` data body.
  - `UserErasedEnvelope` — Standard Webhooks envelope (`type`, `timestamp`, `data → UserIdPayload`).
  - `UserUpdatedPayload` — `{ userId, changed: string[] }` where `changed` is an enum of mutable fields (`username`, `email`, `phone`, `website`, `imageUrl`); never carries values.
  - `UserUpdatedEnvelope` — Standard Webhooks envelope wrapping `UserUpdatedPayload`.

## Relationships

- **`src/modules/webhooks/asyncapi.yaml`** — The parent document that declares `#/servers/subscriberEndpoint`, `#/components/schemas/WebhookHeaders`, and `#/components/schemas/Id`. This fragment's `$ref`s resolve only after merge.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — The build-time bundler that inlines this fragment into the `webhooks` section of the global AsyncAPI document, but only while the users module is present in the project.
- **`src/modules/users/module.ts`** — The runtime source of the events; its `publicEvents` map is what actually dispatches `user.erased` / `user.updated` on the bus.
- **`src/modules/users/openapi.yaml`** — Defines the REST endpoints recipients use to refetch account data after receiving a `user.updated` event (the event itself carries no values).
- **`docs/theory/data-protection.md`** — Referenced in the file header as the GDPR Art. 19 justification for the id-only payload and the "no fresh copy in delivery log" constraint.

## Notes

- **Fragment, not document:** The `$ref` targets (`subscriberEndpoint`, `WebhookHeaders`, `Id`) do not live in this file. Reading it in isolation will show unresolved references.
- **`additionalProperties: false`** on every schema — the payload is closed; adding a field requires a schema change here and in the firing code.
- **`user.updated` excludes preferences:** locale, consent changes, address-book mutations, unconfirmed email-change requests, and resends of already-stored data do **not** fire the event. Only the five enumerated field changes do.
- **`user.erased` fires inside the deletion transaction** (hard delete, post-grace purge, inactivity erase) — never at lock, grace start, or soft delete.
- **`changed` array has `minItems: 1`** — the event is never sent with an empty list.
