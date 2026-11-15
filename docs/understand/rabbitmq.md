---
type: concept
audience: [developer, architect]
---

# RabbitMQ

[RabbitMQ](https://www.rabbitmq.com/) is used as a message broker to offload heavy or unreliable work (emails, webhook delivery, etc.) from the request/response cycle into background queues.

## Why a queue?

| Without queue                      | With queue                                     |
| ---------------------------------- | ---------------------------------------------- |
| Email sent inside the HTTP handler | Message published → handler responds instantly |
| Slow SMTP = slow API response      | Consumer retries independently                 |
| Failure loses the job              | Message is re-queued on failure                |

## Where the code lives

| Concern                   | File                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Connection & helpers      | `src/infrastructure/adapters/queue.ts`                                                              |
| Queue-aware dispatch      | `src/infrastructure/adapters/mailer.ts` → `enqueueEmail()`                                          |
| Email worker (domainless) | `src/infrastructure/adapters/email.worker.ts`                                                       |
| Image digest worker       | `src/infrastructure/adapters/image.worker.ts`                                                       |
| Webhook delivery (module) | `src/modules/webhooks/services/enqueue.ts` (publish), `attempt.ts` (consume)                        |
| Worker registration       | `src/app/workers.ts` (domainless queues) + `kernel/registry.ts`'s `resolveConsumers` (module-owned) |
| Startup hook              | `src/app.ts` → `startQueue` + `registerWorkers`                                                     |
| Shutdown hook             | `src/infrastructure/runtime/server-lifecycle.ts` → `stopQueue`                                      |

## Architecture

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 65}}}%%
flowchart LR
    API[Express handler] -->|publish| RMQ[(RabbitMQ)]
    RMQ -->|consume| Worker[Consumer process]
    Worker --> SMTP[Send email]
    Worker --> Hook[Deliver webhook]

    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef queue fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef worker fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef outbound fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class API app;
    class RMQ queue;
    class Worker worker;
    class SMTP,Hook outbound;
```

## How it's used

### Emails (fire-and-forget)

Everything that sends an email calls `enqueueEmail()` from `src/infrastructure/adapters/mailer.ts`,
from a module's service (not a controller). A mail to a customer about an order, payment, shipment
or return is sent from an outbox-event listener — see [outbox.md](outbox.md#customer-mail):

- **Queue enabled** → the email job is published to the `worker.email.send` queue. The `email.worker.ts` consumer picks it up and calls `sendTemplatedEmail()` in the background.
- **Queue disabled, or the publish failed** → falls back to calling `sendTemplatedEmail()` directly, at the cost of request latency.

Callers include `account/services/mail.ts` (reset, verification, restore links),
`orders/services/notify.ts` and `cancel-mail.ts`, `payments/services/notify.ts`,
`delivery/services/notify.ts`, `returns/services/notify.ts`, `tasks/services/contact.ts` and `tasks/services/personal-data.ts`. `grep -rn enqueueEmail src` is the live list.

### Invoice PDF rendering — NOT a queue

`GET /orders/:id/invoice` and `/credit-notes/:creditNoteId` render synchronously, on the request thread —
`src/modules/invoicing/services/render.ts` — and stream the bytes back. There is no queue, no
worker and no stored status: the frozen `Invoice`/`CreditNote` row is the system of record, and
each request just renders it again — see [invoicing](../modules/invoicing.md).

## Job lifecycle

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 65}}}%%
flowchart LR
    Producer[Controller or service] --> Publish[enqueueEmail / publishToQueue]
    Publish --> Queue[(worker.email.send or a module's own)]
    Queue --> Consume[email.worker / a module's own worker]
    Consume --> Ack[Ack on success]
    Consume --> Retry["Nack, no requeue<br/>(routes to &lt;queue&gt;.retry)"]
    Consume --> Drop["Park in &lt;queue&gt;.dead<br/>(malformed, refused, or attempts exhausted)"]

    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef queue fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef worker fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef result fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class Producer,Publish app;
    class Queue queue;
    class Consume worker;
    class Ack,Retry,Drop result;
```

See [Retries and parking](#retries-and-parking) for what happens after the "nack" and "park" arms.

## Configuration

| Env var                  | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| `NODE_RABBITMQ_URL`      | Full AMQP URI (preferred). Example: `amqp://user:pass@queue:5672`             |
| `NODE_RABBITMQ_HOST`     | Hostname fallback when URL is not set (default `127.0.0.1`).                  |
| `NODE_RABBITMQ_PORT`     | Port fallback. Setting it is what switches the queue on when no URL is given. |
| `NODE_RABBITMQ_USER`     | Username fallback (default `guest`).                                          |
| `NODE_RABBITMQ_PASSWORD` | Password fallback (default `guest`).                                          |
| `NODE_RABBITMQ_ENABLED`  | Set to `0` to disable even if URL is configured.                              |

When neither the URL nor the port is set, all queue operations silently no-op — the rest of the app works normally.

At boot the log names the broker in use, with the credentials left out
(`queue: connecting to amqp://rabbitmq:5672 (from NODE_RABBITMQ_URL)`). `NODE_RABBITMQ_URL` wins over
host and port; the boot log names the broker and its source.

## Docker Compose

The `compose.override.yaml` includes a `queue` service with the management plugin, `rabbitmq:4-management-alpine` —
the same 4.x line as `compose.production.yaml`'s digest-pinned `rabbitmq:4-alpine` image (the
dev one adds the management UI), which is what makes quorum queues' 4.x
behaviour ([Queue type: quorum](#queue-type-quorum), [Priority](#priority)) the same in dev as in
production:

- **AMQP port**: `5672`
- **Management UI**: `http://localhost:15672` (guest / guest)

### Run broker tools as `rabbitmq`, never root

The broker keeps an Erlang cookie at `/var/lib/rabbitmq/.erlang.cookie`, and its CLI tools
(`rabbitmq-diagnostics`, `rabbitmqctl`) create it when it is missing. Run as root before the
broker's first boot, a tool creates it owned by root with mode `400`; the broker then crashes on
`eacces` and stays crashed, because the file lives in the data volume. So the production
healthcheck is `su-exec rabbitmq rabbitmq-diagnostics -q ping` (the alpine image), and a manual
check is `docker exec -u rabbitmq <container> rabbitmq-diagnostics -q ping`, never a plain
`docker exec`. If it already happened, delete the volume's `.erlang.cookie` and restart.

## Usage

### Publishing a message

### Consuming messages

### Retries and parking

A failing job waits in a TTL queue and comes back on its own — the broker owns the delay, not an
app-side timer.

### Queue type: quorum

Every queue `queue.ts` declares — work, retry and dead-letter alike — carries
`x-queue-type: quorum`. Quorum queues are RabbitMQ 4's recommended durable type; classic MIRRORED
queues, their predecessor, are gone in 4.x. The reason it matters here specifically: a quorum
queue tracks its own `delivery-count`, incremented on EVERY redelivery — a consumer that crashes

### Priority

Quorum queues have no `x-max-priority` opt-in: every queue always offers the full 0-31 range, and
a message published with no `priority` at all lands at **4**, not 0
(https://www.rabbitmq.com/docs/quorum-queues#priority). `JobPriority`'s two levels sit above that
default rather than at the classic-queue `0`/`1`, or `'normal'` would rank BELOW an unmarked

### Options

Full detail: [Usage](./rabbitmq-usage.md).

## Recovery

The connection recovers on its own — amqplib's opt-in `recovery` option
(`connect(url, { recovery: { setup } })`), not a hand-rolled retry loop. `setup` runs after every
successful (re)connect, first one included, and is what opens the one channel this process uses
and re-binds every consumer `consumeFromQueue` has ever registered — a fresh channel starts with
none of its own, whether it is boot's first one or a reconnect's.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 45, 'rankSpacing': 60}}}%%
flowchart LR
    D["broker down<br/><i>or still starting</i>"] --> S["slow lane<br/><i>publish/consume degrade inline</i>"]
    S -.->|"amqplib retries<br/>with backoff, forever"| R["broker reachable"]
    R --> U["setup() runs<br/><i>open channel, re-bind every consumer</i>"]
    U --> Q["queue path<br/><i>queueState() reads ready again</i>"]

    classDef bad fill:#fee2e2,stroke:#b91c1c,color:#111827;
    classDef wait fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef done fill:#ccfbf1,stroke:#0f766e,color:#111827;
    class D bad;
    class S wait;
    class R,U,Q done;
```

Three rules the connection layer keeps because of how amqplib's own recovery works:

- **Boot never waits for the broker.** `connect(url, { recovery })`'s promise settles only once
  the FIRST connect succeeds — retrying forever underneath — so `startQueue()` never awaits it;
  awaiting it would stop the app booting until a broker answered.
- **Nothing waits for a channel during an outage.** `createChannel()` on the recovering
  connection parks the caller until reconnected, so `publishToQueue`/`consumeFromQueue` never call
  it directly — they read `currentChannel`, a plain variable `setup` sets and the channel's own
  `close` event clears, `undefined` meaning "take the slow lane".
- **A channel can die while the connection lives.** Recovery only reacts to a CONNECTION drop, so
  a channel-only close (a `PRECONDITION_FAILED`, an ack on an unknown tag) needs its own handling:
  `setupChannel`'s `close` listener re-opens a fresh channel after `CHANNEL_REOPEN_DELAY_MS` and
  replays every consumer this process has ever registered onto it — the same `setup()` the
  connection-level recovery runs, called by hand instead of by amqplib.

`maxRetries` is `0` under `NODE_ENV=test`: amqplib's retry timer is never `.unref()`'d, so an
unreachable broker — the routine case locally, since `.env` names the compose hostname, which
resolves nowhere outside it — would otherwise keep a test process from exiting on its own.
Production keeps the library default, `Infinity`, except in a scheduled job: `run-job.ts` calls
`boundQueueRetries()` (3 retries), because a job process has no forced-exit deadline. A job never
calls `startQueue()`; a mail built in its first moments goes inline, and a connection that lands
after `stopQueue()` is closed instead of kept, so a job always exits.

## Graceful shutdown

`stopQueue()` is called during the app's graceful shutdown sequence (after the HTTP server closes).
It cancels every consumer, waits up to 5 s for handlers still running, then closes the AMQP
connection. A handler that outlives the wait is redelivered.

## Works with

- **[Email & PDF Rendering](./email-and-rendering.md)** — the primary use case for this queue. Controllers publish email jobs instead of calling Nodemailer directly; the `email.worker.ts` consumer sends the email independently. Invoice PDF rendering is NOT queued — see [Invoice PDF rendering](#invoice-pdf-rendering-—-not-a-queue). → [How it's used](./rabbitmq.md#how-it-s-used)

## External references

- [amqplib channel API](https://amqp-node.github.io/amqplib/channel_api.html) — the client library used in `src/infrastructure/adapters/queue.ts`
- [RabbitMQ tutorials (Node.js)](https://www.rabbitmq.com/tutorials) — queue patterns with code examples

## Read next

- [Email & PDF Rendering](./email-and-rendering.md) — primary queue use case
- [Runtime](./runtime.md) — startup/shutdown lifecycle
- [AsyncAPI Workflow](../build/asyncapi-workflow.md) — async contracts for worker queues
- [Redis Cache](./redis-cache.md) — similar optional-infrastructure pattern
