# src/app/workers.ts

## Purpose

Assembly-time registration of all queue consumers for this build. It decides *which* queues the application drains and wires each to its handler, acting as the single startup hook that connects `infrastructure` workers (email, PDF, image) to the `queue` adapter. It exists because the choice of queues is a per-build decision that belongs at the application layer, not inside any individual worker.

## Key elements

- **`registerWorkers()`** — The sole export. Called once during app startup. Resolves image writeback targets from `enabledModules`, then (if RabbitMQ is enabled) registers three consumers via `consumeFromQueue`. Returns a `Promise` that resolves when all consumers are connected.
- **Image writeback resolver** — `registerImageWritebackResolver` is called *unconditionally* (before the `isQueueEnabled()` guard) so the resolver is available even in non-queue contexts. It maps a collection name to its writeback handler using `resolveImageTargets(enabledModules)`.
- **Prefetch settings** — `EMAIL_QUEUE: 5` (I/O-bound), `PDF_QUEUE: 2` (producerless, kept low), `IMAGE_QUEUE: 1` (CPU-bound decode/re-encode).

## Relationships

- **`src/app.ts`** — Calls `registerWorkers()` during application startup.
- **`src/infrastructure/adapters/queue.ts`** — Supplies `consumeFromQueue` (the consumer factory) and `isQueueEnabled` (the feature gate).
- **`src/infrastructure/adapters/email.worker.ts`** — Provides `EMAIL_QUEUE` and `handleEmailJob`.
- **`src/infrastructure/adapters/pdf.worker.ts`** — Provides `PDF_QUEUE` and `handlePdfJob`.
- **`src/infrastructure/adapters/image.worker.ts`** — Provides `IMAGE_QUEUE`, `handleImageDigestJob`, and `registerImageWritebackResolver`.
- **`src/infrastructure/adapters/logger.ts`** — Used for startup info logs.
- **`src/kernel/registry.ts`** — Provides `resolveImageTargets`, which maps enabled modules to their image writeback descriptors.
- **`src/modules.ts`** — Supplies `enabledModules`, the list of active modules whose image targets are resolved.

## Notes

- **`PDF_QUEUE` is producerless.** Nothing in the codebase publishes to it; the invoice endpoint renders synchronously. The consumer is intentionally kept registered as a worked example of the async pattern.
- **The image writeback resolver registration is not gated behind `isQueueEnabled()`.** This is deliberate: it is the one code path allowed to see every module's `imageTargets`, and it costs nothing when no broker is present. Do not move it inside the guard.
- **This file is the "app" layer.** Per the module doc-comment, it is the assembly decision point — individual workers in `infrastructure` do not know *which* queues a build uses.
