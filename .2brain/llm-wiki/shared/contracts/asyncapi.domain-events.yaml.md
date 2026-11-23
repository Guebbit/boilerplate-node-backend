---
source: shared/contracts/asyncapi.domain-events.yaml
generated_at: 2026-11-22T02:22:38.907742+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/asyncapi.domain-events.yaml

## Purpose
AsyncAPI 3.0.0 contract for domain events that belong to no module. Currently it declares only the outbox's own `outbox.event_dead`. Every other event is declared by its emitting module in `src/modules/<module>/asyncapi.domain-events.yaml` and merged into this section by the bundler. It is a backend-only section: it never reaches the public AsyncAPI document, so the paired frontend never sees it. Webhook events, which are promises to API clients, live in `asyncapi.webhooks.yaml`.

## Key elements
- **Channel `domain.outbox.event_dead`** (address `outbox.event_dead`): an outbox row ran out of attempts and was parked as `dead`. It has `x-transport: in-process`.
- **Operation `domainOutboxEventDead`** (`action: send`): emitted by the relay once per row, after its last failed attempt.
- **Message `OutboxEventDeadDomainEvent`**: references the payload schema.
- **Schema `OutboxEventDeadDomainEventPayload`**: an object with required string fields `eventId` (the dead row's id), `eventName` (the stored event's name) and `aggregateId` (what the event was about). `additionalProperties: false`.

## Relationships
- `asyncapi.root.yaml` and `spectral.asyncapi.modules.yaml` are its graph neighbors. The file itself shows no direct reference to either.
- The comments say the bundler merges per-module `asyncapi.domain-events.yaml` files into this section.
- Per the comments, events with `outbox` transport are dispatched by the outbox relay, which validates the stored payload against the schema before any handler runs.
- The `notifications` module reacts to `outbox.event_dead` by telling the administrators.

## Notes
- **Naming convention:**
  - channel `domain.<event>`
  - `address` is the event's own name
  - message `<Pascal>DomainEvent`
  - payload `<Pascal>DomainEventPayload`
  - operation `domain<Pascal>`
- **No `servers`.** `x-transport` sets how an event travels:
  - `outbox`: stored as an outbox row and dispatched by the relay.
  - `in-process`: a plain `emitDomainEvent`, never stored.
- `outbox.event_dead` is deliberately `in-process`. An outbox row about the outbox could itself die and loop.
- Payloads are meant to be tolerant readers: the generator drops unknown fields so a rolling deploy doesn't strand rows already written. The schema nonetheless sets `additionalProperties: false`.
