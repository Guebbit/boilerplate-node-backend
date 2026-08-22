# AsyncAPI Workflow

## AsyncAPI is the async contract source of truth

For this boilerplate, keep REST and async contracts separate:

- REST: `openapi.yaml`
- Async/event-driven: `asyncapi.yaml`

Current scope of `asyncapi.yaml`:

- SSE observability channels (`observability.*`)
- RabbitMQ worker queues (`worker.email.send`, `worker.pdf.generate`)

## Two bundles: the whole contract, and the shared half

The async contract is published twice, from one set of sources:

| File | Holds | Who reads it |
| ---- | ----- | ------------ |
| `asyncapi.yaml` | every channel — SSE **and** the queues | this repo: `gen:asyncapi`, `lint:asyncapi`, Studio |
| `asyncapi.public.yaml` | the SSE channels only | the paired frontend, as its own `asyncapi.yaml` |

The queues are backend-only because a browser can neither publish to nor consume from RabbitMQ. A
frontend holding `EmailJobPayload` would carry the shape of a message it cannot send, and read as a
contract it is expected to honour. So the split is by SECTION, one field in
`scripts/contracts/asyncapi.ts`:

```ts
const SHARED_SECTIONS: readonly AsyncSectionName[] = ['observability'];
```

Both bundles merge the same section documents, so neither can describe a shared channel differently
— `tests/cross-cutting/contract-bundles.test.ts` asserts the public one is a strict subset. Only
`asyncapi.public.yaml` is in `SHARED_FILES`; `asyncapi.yaml` is marked `shared: false` and compared
against nothing.

A server travels with the section whose channels bind to it — `sseLocal` is declared in the
observability module, `rabbitmqLocal` in `asyncapi.workers.yaml` — which is what keeps the broker
out of the public bundle without a second list to maintain.

## Where to edit it

`asyncapi.yaml` at the repo root is **merged from one complete document per section** — do not
hand-edit it. Each section is a valid AsyncAPI document on its own, carrying its own channels,
messages and payload schemas:

```
src/modules/observability/asyncapi.yaml        the SSE stream — a module's own document,
                                               exactly as it carries one openapi.yaml
shared/contracts/asyncapi.workers.yaml         the RabbitMQ queues, which belong to no domain
shared/contracts/asyncapi.root.yaml            version, id, info, tags — no channels, no servers
```

The worker queues are shared rather than owned by a module because the email and PDF workers are
substrate — `src/app/workers.ts` over `src/infrastructure/adapters/queue.ts` — enqueued by whichever
domain needs a mail sent. It is the async twin of filing `GET /` under `system` in the REST contract.

This replaced a three-fragment layout (`channels.yaml`, `messages.yaml`, `schemas.yaml` per section)
whose pieces were half-objects that parsed as nothing until concatenated in the right order at the
right indentation. A whole document can be linted and opened in Studio on its own:

```bash
npm run contracts:bundle        # rebuild both asyncapi bundles (and every other) from their sources
npm run lint:asyncapi:modules   # lint each section document by itself
npm run check:contracts-bundle  # fail if a committed bundle is stale
```

**It is a merge, not `asyncapi bundle`.** The CLI dereferences — inlining every payload into every
channel that names it, 239 lines to 819, and leaving `scripts/gen-asyncapi-types.ts` with no `$ref`
to follow. `scripts/contracts/asyncapi.ts` copies four maps instead and refuses on a collision; its
header carries the full argument, and is the file to read before trying the CLI again.

See [Contract Ownership & Fragmentation](./contract-fragmentation.md) for the whole picture,
including why each bundle uses the verb it does.

## Servers declared

| Name | Protocol | Purpose | Declared in | In the public bundle |
|------|----------|---------|-------------|----------------------|
| `sseLocal` | `http` | SSE observability stream | `src/modules/observability/asyncapi.yaml` | yes |
| `rabbitmqLocal` | `amqp` | Async job queues (email, PDF) | `shared/contracts/asyncapi.workers.yaml` | no |

## Generated TypeScript types

Types are generated from `asyncapi.yaml` into `src/types/asyncapi.generated.ts` by a custom script (`scripts/gen-asyncapi-types.ts`).  
They are re-exported from `src/types/index.ts` so all app code can import them consistently:

```ts
import type { ObservabilityMetricsPayload, EmailJobPayload, PdfJobPayload } from '@types';
import { WORKER_CHANNELS, OBSERVABILITY_CHANNELS } from '@types';
```

Regenerate types after editing `asyncapi.yaml`:

```bash
npm run gen:asyncapi
```

The generator (`scripts/gen-asyncapi-types.ts`) reads `asyncapi.yaml` with `yaml`, converts each `components.schemas` entry into a TypeScript interface, appends the channel-name constants and the SSE payload map, and writes the result to the path given by `--out`.

### Shared with the frontend

This script is **byte-identical** to `scripts/gen-asyncapi-types.ts` in `boilerplate-vue-frontend`,
and both write the same path:

| Repo | Command | Reads |
| --- | --- | --- |
| Backend | `tsx scripts/gen-asyncapi-types.ts --out src/types/asyncapi.generated.ts` | this repo's `asyncapi.yaml` — every channel |
| Frontend | `tsx scripts/gen-asyncapi-types.ts --out src/types/asyncapi.generated.ts` | its `asyncapi.yaml`, which is a copy of `asyncapi.public.yaml` |

The script is the same, the INPUT is not — so the two outputs differ, and are meant to: only this
repo's carries `EmailJobPayload`, `PdfJobPayload` and `WORKER_CHANNELS`. Everything the frontend's
does carry, it carries identically, because the shared half of the spec is one document copied
across.

`asyncapi.public.yaml` and this script are in `SHARED_FILES` (`scripts/spec-identity.ts`), so
`check:spec-identity` fails on the commit that forks either. **The generated outputs are not**, and
deliberately: they legitimately differ now, and even where they overlap a cross-repo comparison
would only re-ask a question the two entries above already answer, at the price of carrying another
file to the frontend on every contract change.

What that comparison *would* have added — "did this repo regenerate after the last spec edit" —
`npm run check:asyncapi-types` answers here, with no sibling checkout to find. The frontend runs the
same gate over its own copy.

## Tooling used here

- `@asyncapi/modelina`: schema-to-code generator used by `scripts/gen-asyncapi-types.ts` to turn `asyncapi.yaml` schemas into TypeScript models/types (then the script appends repo-specific helper exports).
- `@asyncapi/cli`: CLI tooling used by this repo to validate `asyncapi.yaml` and open AsyncAPI Studio.

## Commands used in this repo

```bash
npm run lint:asyncapi         # validate both asyncapi.yaml and asyncapi.public.yaml
npm run gen:asyncapi          # regenerate src/types/asyncapi.generated.ts from asyncapi.yaml
npm run check:asyncapi-types  # fail if the committed types are not what asyncapi.yaml generates
npm run docs:asyncapi         # open AsyncAPI Studio in browser
```

## How this complements OpenAPI

- OpenAPI describes HTTP request/response APIs.
- AsyncAPI describes message/event contracts across async transports.
- Together they provide one contract layer for REST and one for real-time/event-driven flows.

## RabbitMQ queue channels

Worker queues use AMQP (RabbitMQ) for reliable async job processing:

- **`worker.email.send`** — email delivery jobs consumed by `src/infrastructure/adapters/email.worker.ts`
- **`worker.pdf.generate`** — PDF render jobs consumed by `src/infrastructure/adapters/pdf.worker.ts`

Both use the `EmailJobPayload` / `PdfJobPayload` interfaces generated from the contract, and both
queue NAMES are the channel names: `src/infrastructure/adapters/queue.ts` exports `EMAIL_QUEUE` and
`PDF_QUEUE` as aliases of `WORKER_CHANNELS.EMAIL_SEND` and `WORKER_CHANNELS.PDF_GENERATE`, so the
string a producer publishes to and the string the contract declares are one string. The worker types
and names are both derived from AsyncAPI — no hand-written duplicates.

`EmailJob` in `adapters/mailer.ts` IS `EmailJobPayload`, deliberately rather than a local widening
onto Nodemailer's full envelope. The contract declares `request` with `additionalProperties: false`,
and every field it names survives `JSON.stringify` — which is what makes the queued path and the
inline fallback the same call. A `Buffer` attachment does not survive it, so a wider type would
compile, work in development where the broker is off, and corrupt the day it is switched on.

These channels are the reason the contract is published twice: they exist only in `asyncapi.yaml`,
never in `asyncapi.public.yaml`.

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

All SSE and queue names used at runtime come from the `OBSERVABILITY_CHANNELS` and `WORKER_CHANNELS` constants generated into `src/types/asyncapi.generated.ts` — the SSE frame names in `src/infrastructure/observability/stream.ts`, the queue names in `src/infrastructure/adapters/queue.ts`.  
There are no handwritten duplicate string constants — `asyncapi.yaml` is the single source of truth.

## CI enforcement

CI runs `lint:asyncapi`, then `check:asyncapi-types`, which regenerates in memory and compares against the committed `src/types/asyncapi.generated.ts` without writing it. This prevents contract drift — if you edit `asyncapi.yaml` without regenerating types, CI fails and names the one command that fixes it. `npm run complete` runs the same gate locally.
