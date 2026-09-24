---
source: src/app/workers.ts
sha256: ee891dbb324fb627753dd95308cea70c4ee8acc7df32f6312ee544b7f769e8f8
generated_at: 2026-09-23T17:36:39.189182+00:00
model: ollama:qwen3.8:27b
---

# src/app/workers.ts

## Purpose

The single assembly point where all queue consumers are registered at application startup. It directly wires the two app-level queues (email sending, image digestion) and delegates module-owned queues (e.g. webhooks) to the kernel registry, so that new modules never require an edit here.

## Key elements

- **`registerWorkers()`** (exported) — Idempotent entry point called once at startup. Resolves image writeback targets, then—only if `isQueueEnabled()`—registers the email consumer, the image-digest consumer, and every module-declared consumer in a single `Promise.all`. No-ops (resolves immediately) when RabbitMQ is disabled.
- **`registerImageWritebackResolver` call** — Invoked *before* the queue-enabled guard so the resolver is always available; it maps a collection name to its `writeback` field from `resolveImageTargets(enabledModules)`.

## Relationships

- **`src/app.ts`** — Expected caller of `registerWorkers()` during the startup sequence.
- **`src/infrastructure/adapters/queue.ts`** — Provides `consumeFromQueue` (subscription + ack semantics) and `isQueueEnabled` (feature gate).
- **`src/infrastructure/adapters/email.worker.ts`** — Supplies `EMAIL_QUEUE` name and `handleEmailJob` handler.
- **`src/infrastructure/adapters/image.worker.ts`** — Supplies `IMAGE_QUEUE` name, `handleImageDigestJob` handler, and the `registerImageWritebackResolver` injection point.
- **`src/kernel/registry.ts`** — Provides `resolveImageTargets` (writeback map) and `resolveConsumers` (flattens every enabled module's declared consumers).
- **`src/modules.ts`** — Source of `enabledModules`, the array passed to both registry resolvers.
- **`src/types/index.ts`** — Zod schemas (`EmailJobPayloadSchema`, `ImageDigestJobPayloadSchema`) used for payload validation in each consumer.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` calls bracket the registration.

## Notes

- **Prefetch is intentionally asymmetric:** `prefetch: 5` for email (I/O-bound, parallelism is free) vs `prefetch: 1` for image digestion (CPU-bound decode/re-encode; keeps upload bursts from starving request handling).
- **Module queues are never named here.** A module (e.g. webhooks) declares its own consumer in its manifest; `resolveConsumers` picks it up. Adding a module-owned queue requires zero changes to this file.
- **The writeback resolver registration is unconditional.** Even with RabbitMQ off, calling it costs nothing and the image worker *cannot* self-resolve (it would need the full module list, which only the app layer holds).
- The file doc-comment frames itself as the "assembly decision" boundary: naming two queues is an app concern; naming a module's queue is a module concern.
