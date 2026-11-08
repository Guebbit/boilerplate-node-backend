---
source: src/app/workers.ts
sha256: ee891dbb324fb627753dd95308cea70c4ee8acc7df32f6312ee544b7f769e8f8
generated_at: 2026-11-08T03:14:49.646637+00:00
model: ollama:qwen3.8:27b
---

# src/app/workers.ts

## Purpose
Queue-consumer registration for this build. It is the single assembly point where the app decides *which* queues exist at the infrastructure level (email, image) and delegates all module-owned queues to the kernel registry. This separation keeps the app from hard-coding module-specific queue names while still naming the two queues that make sense even in a module-less application.

## Key elements
- **`registerWorkers(): Promise<void>`** — The sole export. Called once during app startup. Registers the image-writeback resolver unconditionally, then (if RabbitMQ is enabled) kicks off three groups of consumers in parallel: the email queue, the image-digest queue, and every consumer declared by enabled modules via `resolveConsumers`.
- **`registerImageWritebackResolver`** (imported) — Called unconditionally, before the `isQueueEnabled` guard, because this file is the only place that can see all modules' `imageTargets` simultaneously.
- **Prefetch tuning** — Email uses `prefetch: 5` (I/O-bound); image uses `prefetch: 1` (CPU-bound decode/re-encode/thumbnail). Documented inline.

## Relationships
- **`src/app.ts`** — Expected caller of `registerWorkers` during startup (no-op path when queue is disabled).
- **`src/infrastructure/adapters/queue.ts`** — Provides `consumeFromQueue` and `isQueueEnabled`; the actual RabbitMQ binding logic lives there.
- **`src/infrastructure/adapters/email.worker.ts`** — Source of `EMAIL_QUEUE` name and `handleEmailJob` handler.
- **`src/infrastructure/adapters/image.worker.ts`** — Source of `IMAGE_QUEUE`, `handleImageDigestJob`, and `registerImageWritebackResolver`.
- **`src/kernel/registry.ts`** — Provides `resolveImageTargets` (maps module → writeback collection) and `resolveConsumers` (collects module-declared queue bindings).
- **`src/modules.ts`** — Supplies the `enabledModules` array passed to both registry helpers.
- **`src/types/index.ts`** — Provides the Zod payload schemas (`EmailJobPayloadSchema`, `ImageDigestJobPayloadSchema`) used for job validation.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` for startup lifecycle messages.

## Notes
- The image-writeback resolver is registered **before** the `isQueueEnabled` early-return. This is intentional and documented: the worker cannot resolve targets itself, and registering a resolver has zero cost when no broker exists.
- Module-owned queues (e.g. `worker.webhook.deliver`) are **never** named in this file. Adding a new module queue requires no edit here — it flows through `resolveConsumers(enabledModules)`.
- `// Stryker disable next-line all` comments guard the two `logger.info` calls from mutation testing, since removing them would not change observable behavior.
- The module docblock explicitly marks this file as `app`-tier while the handlers it wires are `infrastructure`-tier; this is an architectural naming convention, not a directory coincidence.
