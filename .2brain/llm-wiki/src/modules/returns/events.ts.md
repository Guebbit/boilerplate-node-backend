---
source: src/modules/returns/events.ts
source_sha256: 2df89aa0be6b936e964504fa9e3b7ff197a37749ce3a7aae7a58df6904d88704
context_sha256: 4012f1e2840868f0b8a47e1ec2851f57fa470bdf382cd5c663e355eecbeda925
generated_at: 2026-11-22T07:25:06.924249+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/events.ts

## Purpose
Declares the domain event name constants that the `returns` module emits. The events themselves are defined in `./asyncapi.domain-events.yaml`. Each constant is projected into the `webhooks` module's public event catalogue by `publicEvents` in `module.ts`.

## Key elements
All exports are string constants typed via `satisfies DomainEventName` from `@kernel/events`:
- `RETURN_REQUESTED` = `'return.requested'`
- `RETURN_RECEIVED` = `'return.received'`
- `RETURN_CLOSED` = `'return.closed'`
- `RETURN_DECIDED` = `'return.decided'`
- `RETURN_CLOSED_BY_HAND` = `'return.closed_by_hand'`

## Relationships
- **`src/kernel/events.ts`**: provides the `DomainEventName` type. `satisfies` checks each name against it at compile time.
- **`src/modules/returns/module.ts`**: uses these events for `publicEvents`, which projects them into the webhooks public catalogue.
- **`src/modules/returns/services/*`** (`close`, `decide`, `outcome`, `receive`): sit alongside this file in the module's dependency graph. They are presumably where the events are emitted, but that is not visible in this file.
- **`src/modules/returns/index.ts`**: related through the dependency graph.
- **Tests** (`src/modules/returns/tests/integration/*`, `src/modules/returns/tests/unit/public-events.test.ts`): are related to this file in the graph. The unit test `public-events.test.ts` is probably about the public event projection.

## Notes
- Each name must match a channel in `asyncapi.domain-events.yaml`. This file only holds the names, with no payload types or logic.
- `satisfies` keeps each constant as a literal type while still validating it against `DomainEventName`.
