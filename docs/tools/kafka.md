# Kafka

## What it is

Kafka is a **distributed message broker** built for high-throughput, durable, ordered event streaming.

Think of it as a persistent log: producers write events to named topics, consumers read from them at their own pace. Events are kept on disk and can be replayed.

## Why use it?

| Without Kafka                         | With Kafka                                    |
| ------------------------------------- | --------------------------------------------- |
| Events live only in memory (lost on restart) | Events are persisted and replayable      |
| One consumer per event                | Many independent consumers, same topic        |
| Service-to-service coupling           | Services talk through topics, not each other  |
| Can't catch up on missed events       | Consumers can rewind and replay               |

## Is it required for events?

**No.** This boilerplate already has a working in-process event system:

- `src/utils/domain-events.ts` — fires events via Node's built-in `EventTarget`
- AsyncAPI channels define the contract (e.g. `ecommerce.cart.checked_out`)
- Everything works without Kafka or any broker

Kafka is useful when you need to:

- scale across multiple services / processes
- guarantee no events are lost across restarts
- let multiple consumers react to the same event independently
- replay past events for analytics, auditing, or new services

## Kafka vs RabbitMQ

| Feature              | Kafka                    | RabbitMQ                 |
| -------------------- | ------------------------ | ------------------------ |
| Model                | Persistent log           | Message queue (delete on ack) |
| Replay               | ✅ Yes                   | ❌ No                   |
| Multi-consumer       | ✅ Easy (consumer groups)| ⚠️ Needs fanout exchange |
| Ordering             | Per-partition            | Per-queue                |
| Best for             | Event streams, analytics | Task queues, background jobs |

**Quick rule**: use RabbitMQ for fire-and-forget background tasks (emails, PDFs). Use Kafka when event history matters or multiple services consume the same event.

## Kafka vs in-process EventTarget

| Feature      | `EventTarget` (current) | Kafka                        |
| ------------ | ----------------------- | ----------------------------- |
| Setup        | Zero                    | Docker / cloud service        |
| Persistence  | No                      | Yes                           |
| Cross-process| No                      | Yes                           |
| Replay       | No                      | Yes                           |

Start with `EventTarget`. Add Kafka when you outgrow it.

## How events map to Kafka

The AsyncAPI channel names (`ecommerce.cart.checked_out`, `realtime.chat.*`, etc.) are designed to map directly to Kafka topic names. No rename needed.

Producers would call `emitDomainEvent(ECOMMERCE_CHANNELS.CART_CHECKED_OUT, payload)` and a Kafka adapter can subscribe to `domainEvents` and forward to the broker — **without changing any call-site**.

## Where to plug it in

`src/utils/domain-events.ts` has a comment marking where a Kafka adapter belongs:

```ts
// Shared in-process event target. Future Kafka/broker adapters can subscribe here
// and forward events to the message bus without changing call-sites.
export const domainEvents = new EventTarget();
```

A future adapter would look like:

```ts
domainEvents.addEventListener(ECOMMERCE_CHANNELS.CART_CHECKED_OUT, (e) => {
    const payload = (e as CustomEvent).detail;
    kafkaProducer.send({ topic: ECOMMERCE_CHANNELS.CART_CHECKED_OUT, messages: [{ value: JSON.stringify(payload) }] });
});
```

## Docker Compose (local)

Add a Kafka service when needed. The most common option for local dev is [Redpanda](https://docs.redpanda.com/), which is Kafka-compatible and starts in seconds:

```yaml
redpanda:
  image: redpandadata/redpanda:latest
  command: redpanda start --overprovisioned --smp 1 --memory 512M --reserve-memory 0M --node-id 0 --check=false
  ports:
    - "9092:9092"
```

## Useful links

- [Apache Kafka documentation](https://kafka.apache.org/documentation/)
- [KafkaJS — Node.js client](https://kafka.js.org/)
- [Redpanda (Kafka-compatible, easier local dev)](https://docs.redpanda.com/)
- [AsyncAPI Kafka bindings](https://github.com/asyncapi/bindings/blob/master/kafka/README.md)

## Related pages

- [AsyncAPI Workflow](../api/asyncapi-workflow.md) — how event contracts and channel names are defined
- [RabbitMQ](./rabbitmq.md) — task queues vs event streams
- [WebSockets](./websockets.md) — real-time transport layer
