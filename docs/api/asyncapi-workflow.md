# AsyncAPI Workflow

## AsyncAPI is the async contract source of truth

For this boilerplate, keep REST and async contracts separate:

- REST: `openapi.yaml`
- Async/event-driven: `asyncapi.yaml`

Current scope of `asyncapi.yaml`:

- WebSocket chat contracts (`/ws/chat`)
- SSE observability contracts (`/observability/events`)
- Ecommerce cart checkout event (`ecommerce.cart.checked_out`)

## Commands used in this repo

```bash
npm run lint:asyncapi
npm run gen:asyncapi-types
npm run docs:asyncapi
```

## How this complements OpenAPI

- OpenAPI describes HTTP request/response APIs.
- AsyncAPI describes message/event contracts across async transports.
- Together they provide one contract layer for REST and one for real-time/event-driven flows.

## Naming convention

Channels use dot-separated topic-style naming (for example `ecommerce.cart.checked_out`) so the same contracts can map naturally to Kafka topics in a future PR.
