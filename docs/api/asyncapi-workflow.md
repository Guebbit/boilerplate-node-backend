# AsyncAPI Workflow

## AsyncAPI is the async contract source of truth

For this boilerplate, keep REST and async contracts separate:

- REST: `openapi.yaml`
- Async/event-driven: `asyncapi.yaml`

Current scope of `asyncapi.yaml`:

- WebSocket chat channels (`realtime.chat.*`)
- SSE observability channels (`observability.*`)
- Ecommerce cart checkout event (`ecommerce.cart.checked_out`)

## Generated TypeScript types

Types are generated from `asyncapi.yaml` into `src/types/asyncapi.ts` by a custom script (`scripts/gen-asyncapi-types.ts`).  
They are re-exported from `src/types/index.ts` so all app code can import them consistently:

```ts
import type { IChatMessagePayload } from '@types';
import { OBSERVABILITY_CHANNELS } from '@types';
```

Regenerate types after editing `asyncapi.yaml`:

```bash
npm run gen:asyncapi-types
```

The generator (`scripts/gen-asyncapi-types.ts`) reads `asyncapi.yaml` with `js-yaml`, converts each `components.schemas` entry into a TypeScript interface, and writes the result to `src/types/asyncapi.ts`.

## Commands used in this repo

```bash
npm run lint:asyncapi       # validate asyncapi.yaml
npm run gen:asyncapi-types  # regenerate src/types/asyncapi.ts
npm run docs:asyncapi       # open AsyncAPI Studio in browser
```

## How this complements OpenAPI

- OpenAPI describes HTTP request/response APIs.
- AsyncAPI describes message/event contracts across async transports.
- Together they provide one contract layer for REST and one for real-time/event-driven flows.

## Naming convention

Channels use dot-separated topic-style naming (for example `ecommerce.cart.checked_out`), and Kafka publishes those exact channel names as topic names (or prefixed topic names when `NODE_KAFKA_TOPIC_PREFIX` is set).

## Realtime event names

All SSE and WebSocket event names used at runtime come from the `CHAT_CHANNELS`, `OBSERVABILITY_CHANNELS`, and `ECOMMERCE_CHANNELS` constants generated into `src/types/asyncapi.ts`.  
There are no handwritten duplicate string constants — `asyncapi.yaml` is the single source of truth.
