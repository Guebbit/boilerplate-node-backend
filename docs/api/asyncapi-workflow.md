# AsyncAPI Workflow

## AsyncAPI is the async contract source of truth

For this boilerplate, keep REST and async contracts separate:

- REST: `openapi.yaml`
- Async/event-driven: `asyncapi.yaml`

Current scope of `asyncapi.yaml`:

- SSE observability channels (`observability.*`)
- RabbitMQ worker queues (`worker.email.send`, `worker.pdf.generate`)

## Servers declared

| Name | Protocol | Purpose |
|------|----------|---------|
| `sseLocal` | `http` | SSE observability stream |
| `rabbitmqLocal` | `amqp` | Async job queues (email, PDF) |

## Generated TypeScript types

Types are generated from `asyncapi.yaml` into `src/types/asyncapi.ts` by a custom script (`scripts/gen-asyncapi-types.ts`).  
They are re-exported from `src/types/index.ts` so all app code can import them consistently:

```ts
import type { IObservabilityMetricsPayload, IEmailJobPayload, IPdfJobPayload } from '@types';
import { WORKER_CHANNELS, OBSERVABILITY_CHANNELS } from '@types';
```

Regenerate types after editing `asyncapi.yaml`:

```bash
npm run genasyncapi
```

The generator (`scripts/gen-asyncapi-types.ts`) reads `asyncapi.yaml` with `yaml`, converts each `components.schemas` entry into a TypeScript interface, appends the channel-name constants and the SSE payload map, and writes the result to the path given by `--out`.

### Shared with the frontend

This script is **byte-identical** to `scripts/gen-asyncapi-types.ts` in `boilerplate-vue-frontend`
(PROPOSAL §5, option B — the frontend's generator was the more capable one and became the shared
implementation). Only the output path differs, and it comes from `--out` in each repo's
`genasyncapi` script:

| Repo | Command |
| --- | --- |
| Backend | `tsx scripts/gen-asyncapi-types.ts --out src/types/asyncapi.ts` |
| Frontend | `tsx scripts/gen-asyncapi-types.ts --out src/types/realtime.generated.ts` |

Because the input (`asyncapi.yaml`) is also identical, the two generated files are identical too —
`diff` proves it. It emits a superset of what either side uses: the backend consumes
`OBSERVABILITY_CHANNELS` / `TObservabilityChannel` and the payload interfaces, the frontend
consumes `ISseEventPayloadMap` for per-event typing. The unused exports are type-only on the
backend and tree-shaken in the frontend bundle.

**If you change this script, copy it to the other repo.** Nothing enforces it automatically.

## Tooling used here

- `@asyncapi/modelina`: schema-to-code generator used by `scripts/gen-asyncapi-types.ts` to turn `asyncapi.yaml` schemas into TypeScript models/types (then the script appends repo-specific helper exports).
- `@asyncapi/cli`: CLI tooling used by this repo to validate `asyncapi.yaml` and open AsyncAPI Studio.

## Commands used in this repo

```bash
npm run lint:asyncapi   # validate asyncapi.yaml
npm run genasyncapi     # regenerate src/types/asyncapi.ts
npm run docs:asyncapi   # open AsyncAPI Studio in browser
```

## How this complements OpenAPI

- OpenAPI describes HTTP request/response APIs.
- AsyncAPI describes message/event contracts across async transports.
- Together they provide one contract layer for REST and one for real-time/event-driven flows.

## RabbitMQ queue channels

Worker queues use AMQP (RabbitMQ) for reliable async job processing:

- **`worker.email.send`** — email delivery jobs consumed by `src/workers/email.worker.ts`
- **`worker.pdf.generate`** — PDF render jobs consumed by `src/workers/pdf.worker.ts`

Both use the `IEmailJobPayload` / `IPdfJobPayload` interfaces generated from the contract. The worker types are derived from AsyncAPI — no hand-written duplicates.

## Why there is no Redis channel here

Redis is in this stack, but it is not in this contract. It is used as a **shared cache store**,
not as a message bus: every worker reads and writes the same keys, so a write that deletes them
is already visible to every other worker. There is nothing to announce.

A `cache.tags.invalidated` channel did live here and was removed — see
[Redis Cache → Why there is no cross-instance broadcast](../tools/redis-cache.md#why-there-is-no-cross-instance-broadcast)
for the condition that would bring it back.

## Naming convention

Channels use dot-separated topic-style naming (for example `observability.metrics.updated`). These names are used as event identifiers at runtime (SSE event names, queue names).

Every channel here describes something that actually crosses a process boundary — a frame on an SSE stream, a message on a RabbitMQ queue. An in-process notification is not a channel: an `ecommerce.cart.checked_out` channel was declared here for a checkout event that only ever dispatched to an in-process `EventTarget` with no listeners, and it was removed along with the event rather than left describing a wire nothing travels on.

## Realtime event names

All SSE and queue names used at runtime come from the `OBSERVABILITY_CHANNELS` and `WORKER_CHANNELS` constants generated into `src/types/asyncapi.ts`.  
There are no handwritten duplicate string constants — `asyncapi.yaml` is the single source of truth.

## CI enforcement

CI runs `lint:asyncapi` and `genasyncapi`, then verifies `src/types/asyncapi.ts` has no uncommitted changes. This prevents contract drift — if you edit `asyncapi.yaml` without regenerating types, CI fails.
