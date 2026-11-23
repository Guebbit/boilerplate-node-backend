---
source: src/infrastructure/adapters/pubsub.ts
source_sha256: 122eed79f4eb664971e8ae0a52c6a4ecf910f7f1856d0ed5deed4ee5c86a7ca2
context_sha256: 5b3ae49332e114fc05df29cd22f99f2cc51a41104d72775192f6b159165880dd
generated_at: 2026-11-22T02:41:16.822105+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/pubsub.ts

## Purpose
Redis pub/sub between copies of the app: one process publishes a message and every process subscribed to that channel receives it. It is fail-open. With no Redis configured, or an unreachable one, publishes are dropped, subscriptions never arrive, and callers keep working on their own process's state. It uses the cache Redis (`NODE_REDIS_URL`), not the rate-limit instance, because pub/sub stores no keys and so is unaffected by cache eviction.

## Key elements
- `publishMessage(channel, message)`: fire-and-forget publish on the prefixed channel. Failures are reported once through `publisher.reportUnavailable` and dropped. In-flight publishes are tracked in a `publishing` set.
- `subscribeToChannel(channel, onMessage, onLost)`: ensures this process is subscribed. It resolves `true` if a subscription is live, and `false` if Redis is off or unreachable. Connections are memoised per channel in a `subscriptions` map. The first call's `onMessage` and `onLost` stay in effect, and later calls reuse them.
- `stopPubSub()`: waits for pending publishes, stops all subscriber connections, clears the map, then stops the publisher. It is safe to call when nothing was opened.
- `publisher`: a `manageConnection` instance with its own client, since a client in subscriber mode can't run other commands.
- `subscriberConnection(...)`: builds one subscriber's managed connection. It connects, subscribes, and listens for `terminated`.
- `channelKey(name)`: prefixes channel names with `NODE_REDIS_CACHE_PREFIX` so staging and production sharing a Redis don't hear each other.
- `openClient(onError)`: creates and connects a client, attaching the required `error` listener. It returns `undefined` if no URL is configured.
- `isPubSubEnabled`: true when a Redis URL is configured. The cache's kill switch does not apply.

## Relationships
- `redis.ts`: supplies `configuredRedisUrl`, `createRedisClient`, `closeRedisClient` and the `RedisClient` type.
- `managed-connection.ts`: `manageConnection` / `ManagedConnection` provide memoised, demand-driven connection lifecycle (`get`, `reportUnavailable`, `forget`, `stop`).
- `config.ts`: `redisConfig().NODE_REDIS_CACHE_PREFIX` for channel names.
- `logger.ts`: logs a warning when a subscriber is lost.
- `stream.ts` (notifications): the surrounding neighbors suggest it is the consumer of this adapter, but the file itself shows no callers.
- `server-lifecycle.ts`, `shutdown-infra.test.ts`: likely shutdown wiring that calls `stopPubSub`. This is not visible in this file.
- `pubsub.test.ts`: unit tests for this module.

## Notes
- No timer-based reconnect. A lost subscriber is dropped with `connection.forget()`, reports loss once via `onLost`, and a fresh one opens on the next `subscribeToChannel` call.
- Messages published while a subscriber is down are lost, because pub/sub keeps no history.
- A `stopping` flag prevents `stopPubSub` closures from being reported as a loss.
- If `SUBSCRIBE` is refused, the client is closed before the error is rethrown, so it doesn't leak.
- Publishing uses a separate connection from subscribing (two connections per process, plus one per subscribed channel).
