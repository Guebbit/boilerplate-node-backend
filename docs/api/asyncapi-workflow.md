# AsyncAPI Workflow

## AsyncAPI is the async contract source of truth

For this boilerplate, keep REST and async contracts separate:

- REST: `openapi.yaml`
- Async/event-driven: `asyncapi.yaml`

Current scope of `asyncapi.yaml`:

- Implemented now:
  - WebSocket chat contracts (`/ws/chat`)
  - SSE observability contracts (`/observability/events`)
- Future examples (documented only):
  - ecommerce events (`order.created`, `payment.*`, `inventory.updated`, `cart.checked_out`)

Kafka/RabbitMQ runtime wiring is intentionally out of scope for this PR.
Those channels stay in the spec as documented future contracts and are not emitted by runtime code yet.

## Commands used in this repo

```bash
npm run lint:asyncapi
npm run gen:asyncapi-types
npm run docs:asyncapi
```

Generated realtime contracts are committed at:

- `src/utils/realtime-contracts.generated.ts`

Keep this file regenerated whenever `asyncapi.yaml` changes.

Runtime validation is intentionally minimal in this boilerplate to keep setup small; AsyncAPI-generated TypeScript contracts are the primary contract safety layer.

## How this complements OpenAPI

- OpenAPI describes HTTP request/response APIs.
- AsyncAPI describes message/event contracts across async transports.
- Together they provide one contract layer for REST and one for real-time/event-driven flows.

## Naming guidance for future Kafka adoption

Channels use topic-friendly naming (for example `ecommerce.order.created`) so the same contracts can map naturally to Kafka topics in a future PR.
