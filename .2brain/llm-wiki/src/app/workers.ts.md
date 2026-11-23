---
source: src/app/workers.ts
source_sha256: 7823e3c712211b8cb6dadab324a486ee5d56ddafab6c6d49c5f4fb7f2b459eb0
context_sha256: a742cb878e3e52e299d5b33d8f095dd9559f823d248c0fc089820e0fe3c2764a
generated_at: 2026-11-22T02:32:16.570410+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/workers.ts

## Purpose
Queue-consumer registration for the worker process (`src/worker.ts`). It assembles the list of every consumer this build knows (infrastructure email/image queues plus module-declared ones) and registers those that match the process's role. It also starts the durable fallback-queue drain for the same channels.

## Key elements
- `registerImageWriteback()`: Builds the per-collection image writeback map from `resolveImageTargets(enabledModules)` and hands a resolver to `registerImageWritebackResolver`. Needed by both the worker and the web process, since the web process runs digests inline when the broker is unconfigured or down.
- `allConsumers()` (private): Returns the full `ModuleConsumer[]` list:
  - `EMAIL_QUEUE` → `handleEmailJob`, `EmailJobPayloadSchema`, prefetch 5.
  - `EMAIL_URGENT_QUEUE` → same handler and schema, prefetch 5, on its own consumer so ordinary mail never waits ahead of urgent mail such as reset links.
  - `IMAGE_QUEUE` → `handleImageDigestJob`, `ImageDigestJobPayloadSchema`, prefetch 1, because image work is CPU-bound.
  - `...resolveConsumers(enabledModules)`: every enabled module's own consumers, with no edit needed here when modules are added.
- `registerWorkers()`: Returns a `Promise<void>`.
  - It is a no-op if `isQueueEnabled()` is false.
  - Otherwise it reads `NODE_WORKER_ROLE` from `serverConfig()` and filters consumers with `isServedBy(role, queue)`. It calls `consumeFromQueue` for each, then calls `startJobDrain(consumers, role)` once all have registered.

## Relationships
- `src/infrastructure/adapters/queue.ts`: Provides `consumeFromQueue`, `isQueueEnabled` and `EMAIL_URGENT_QUEUE`.
- `src/infrastructure/adapters/email.worker.ts` and `image.worker.ts`: Provide the queue names and handlers wired directly here. The image worker also supplies `registerImageWritebackResolver`.
- `src/infrastructure/adapters/job-drain.ts`: Provides `startJobDrain`, which drains held jobs from the database.
- `src/infrastructure/adapters/job-kinds.ts`: Provides `isServedBy`, which decides whether a role serves a queue.
- `src/infrastructure/runtime/config.ts`: `serverConfig()` supplies `NODE_WORKER_ROLE`.
- `src/infrastructure/adapters/logger.ts`: Used for info logging.
- `src/kernel/registry.ts`: Provides `resolveImageTargets`, `resolveConsumers` and the `ModuleConsumer` type.
- `src/modules.ts`: Provides `enabledModules`.
- `src/types/index.ts`: Provides the email and image job payload schemas.
- `src/app/worker-process.ts` and `src/app/process-boot.ts`: Neighbors in the graph. Their exact calls into this file are not visible here. The file's docs say `registerWorkers` is called once by the worker process.
- `tests/unit/app/workers.test.ts`: Unit tests for this file.

## Notes
- Only the worker process calls `registerWorkers`. The web process only publishes jobs, but it still needs `registerImageWriteback`.
- Modules cannot call `consumeFromQueue` themselves. They declare consumers in their manifests, and this file collects them via `resolveConsumers`.
- The handler is invoked as `consumer.handler(message)` rather than passed detached, because a module's handler may be a method.
- `allConsumers()` returns every consumer regardless of role. Role filtering happens in `registerWorkers`, and the same full list is passed to `startJobDrain`.
