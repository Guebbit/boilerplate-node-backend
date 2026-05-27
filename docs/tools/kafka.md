# Kafka

[Kafka](https://kafka.apache.org/) is an optional event broker used here to transport the same channels defined in `asyncapi.yaml`.

## Why it exists in this boilerplate

- Keeps AsyncAPI channel contracts transport-agnostic.
- Lets local demos publish real broker events without breaking in-memory flows.
- Provides a starter consumer pattern for audit/analytics pipelines.

## Where the code lives

| Concern                     | File                                    |
| --------------------------- | --------------------------------------- |
| Kafka client + producer API | `src/utils/kafka.ts`                    |
| Domain event bridge         | `src/utils/domain-events-kafka.ts`      |
| Demo consumers              | `src/workers/kafka.worker.ts`           |
| Chat/SSE Kafka publishing   | `src/utils/realtime-*.ts`               |
| Cart checkout event source  | `src/controllers/cart/post-checkout.ts` |

## Topic naming

- Topic names map 1:1 to AsyncAPI channel names by default.
- Optional prefix: `NODE_KAFKA_TOPIC_PREFIX=dev` → `dev.realtime.chat.event.message.new`.

## Local setup (Docker Compose)

`docker-compose.yml` includes a `kafka` service (Redpanda-compatible Kafka API).

```bash
docker compose up -d kafka
```

Then configure:

```bash
NODE_KAFKA_BROKERS=localhost:19092
NODE_KAFKA_ENABLED=1
```

## Important env vars

| Env var                               | Description                                  |
| ------------------------------------- | -------------------------------------------- |
| `NODE_KAFKA_BROKERS`                  | Comma-separated broker list (preferred).     |
| `NODE_KAFKA_HOST` / `NODE_KAFKA_PORT` | Fallback when `NODE_KAFKA_BROKERS` is unset. |
| `NODE_KAFKA_ENABLED`                  | Set `0` to force-disable Kafka.              |
| `NODE_KAFKA_CLIENT_ID`                | KafkaJS client id.                           |
| `NODE_KAFKA_TOPIC_PREFIX`             | Optional namespace prefix for all topics.    |
| `NODE_KAFKA_AUDIT_GROUP`              | Consumer group used by demo audit workers.   |

If Kafka is not configured, all Kafka helpers no-op and the in-memory flow still works.
