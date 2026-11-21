---
type: concept
audience: [developer]
---

# Broker testing

`npm run test:broker` runs the queue adapter (`src/infrastructure/adapters/queue.ts`) against a
**real RabbitMQ**. About 20 seconds, and it needs a broker.

## Why the unit suite is not enough

`tests/unit/infrastructure/adapters/queue.test.ts` mocks `amqplib`. It proves the arguments we pass
(`x-delivery-limit`, a TTL, a dead-letter target) and never what RabbitMQ does with them. Every
case in `tests/broker/queue-broker.test.ts` is one only a broker can answer:

| Case                                   | What only a real broker proves                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| topology                               | quorum, `at-least-once`, `reject-publish`, TTL and `x-delivery-limit` declare on the image; a second declare is not `PRECONDITION_FAILED` |
| retry                                  | a throwing handler gets the job back after the TTL, with the attempt counted in `x-retry-attempt`, which `attemptsOf` reads               |
| parking                                | spent attempts land in `<queue>.dead` and `parkedCounts()` sees them; a `false` handler parks without a retry                             |
| a consumer that dies without answering | the job comes back with a higher `x-delivery-count` while under the limit; past it, it is parked in `<queue>.dead` (`delivery_limit`)     |
| prefetch                               | a consumer holds at most `prefetch` unacknowledged jobs                                                                                   |
| reconnect                              | a connection closed from the broker's side is recovered and the consumer is re-bound                                                      |

Left out as redundant: the webhook path through the broker (the live e2e and
`modules/webhooks/tests/integration/delivery.test.ts`), and publish-confirm refusal and timeout — a
broker cannot be made to refuse on demand without testing RabbitMQ itself, and the unit tests cover
our branch.

## The worker-shutdown case

`tests/broker/worker-shutdown.test.ts` spawns `src/worker.ts` as a real process, because the signal
handler, `stop` and `process.exit` do not run under jest. SIGTERM arrives while a mail job is in
flight; the answer is released after the lame-duck delay, so the job is still running when the worker starts waiting for running jobs.

| Part                      | How                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a slow job, none in `src` | a real `worker.email.send` job; `support/held-smtp.ts` withholds its final `250` until the test releases it                                                                                                                                                         |
| two workers               | A is the only consumer, so the job reaches it; B boots after the job is held, as the rolling-update replacement                                                                                                                                                     |
| database                  | both children get `NODE_TEST_MONGO_URI`, the shared in-memory mongod the config's `globalSetup` starts: no second mongod, no CI step                                                                                                                                |
| what it asserts           | A exits `0` inside the grace period; ready and unacked are 0 on the work, `.retry` and `.dead` queues (management API, read after its stats interval); one mail sent. A handler that threw would be acked and republished to `.retry`, so that queue is checked too |
| ready is not bound        | the worker logs "listening" before its consumer is bound, so the case waits on the broker's consumer count before publishing                                                                                                                                        |

## The broker

`NODE_TEST_RABBITMQ_URL` if set; otherwise the suite starts `rabbitmq:4-management` with
`${CONTAINER_ENGINE:-podman}` through `tests/support/container-engine.ts` and removes it afterwards.
CI sets the variable, because a service container is already listening there.

| Variable                            | Unset (default)                                     | Set                                       |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `NODE_TEST_RABBITMQ_URL`            | the suite starts and stops its own container        | that broker (needs the management plugin) |
| `NODE_TEST_RABBITMQ_MANAGEMENT_URL` | the AMQP URL's host on port 15672, same credentials | that HTTP API                             |
| `NODE_TEST_RABBITMQ_IMAGE`          | `docker.io/library/rabbitmq:4-management`           | the image the container starts            |

The **management** image, although production runs `rabbitmq:4-alpine`: two cases read the declared
arguments back and close a connection from the broker's side, and only the HTTP API does either.

Each run declares everything inside a **vhost of its own** and deletes it afterwards. The adapter's
queue and exchange names are fixed, so a shared broker that remembered a previous run would answer
`PRECONDITION_FAILED` to the next.

The suite **fails** rather than skips when neither a URL nor an engine is available: a green skip
reads exactly like a green pass, and this is the only thing that checks the adapter against a real
broker.

## Shape of the suite

| Choice                                                          | Why                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| own config, `jest.config.broker.js`                             | `tests/support/setup.ts` and the shared mongod are wrong here; `npm test` stays free of a container      |
| `NODE_QUEUE_RETRY_DELAY_SECONDS=1`, `NODE_QUEUE_MAX_ATTEMPTS=2` | a retry takes seconds, not the production 30                                                             |
| a fresh module copy per adapter                                 | `queue.ts` keeps its channel in module state; two copies are two processes                               |
| `NODE_ENV=development` for the reconnect case                   | under `test` the adapter's recovery gets `maxRetries: 0` (`RECOVERY_OPTIONS`) and would never reconnect  |
| crashing consumers are raw `amqplib`                            | the adapter cannot "die"; a channel closed without an ack is what a dead worker looks like to the broker |

## Why it is not in `complete`

A container engine and a ~20 second run, on a gate that otherwise needs neither. It sits in
`complete:manual` beside `test:prism` and `test:replicas`, and runs in CI on every push in its own
`broker` job with a RabbitMQ service container.

## Read next

- [Replicas testing](./replicas-testing.md)
- [Integration Testing](./integration-testing.md)
- [Testing — Quick Start](./testing-quickstart.md)
