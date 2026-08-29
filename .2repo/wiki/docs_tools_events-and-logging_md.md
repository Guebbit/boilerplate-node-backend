# docs/tools/events-and-logging.md

## Purpose

Disambiguation and decision-guide page for the seven mechanisms in the codebase that record "something happened" (logger, audit, analytics, metrics, traces, SSE live feed, queue jobs). It exists to stop developers from reaching for the wrong one, to document which two cross a process boundary, and to clarify the in-process domain event bus so it is not mistaken for an observability signal or a broker substitute.

## Key elements

- **Seven-signal table** — maps each signal to its entry-point module, destination sink, intended reader, and the detailed doc page.
- **Decision guide ("Which one do I want?")** — five common intents mapped to the correct signal; explicitly separates audit from analytics.
- **Audit dual-destination diagram** — `emitAuditEvent` fans out to Winston→Loki *and* `IAuditSink`→Mongo `auditlogs`; the log line is the source of truth, the Mongo copy is a queryable, TTL-bound, allowed-to-fail mirror.
- **Domain event bus section** — documents `src/kernel/events.ts`: sequential awaited handlers, log-and-skip on throw, open `DomainEventMap` augmentation pattern, and explicit "do not grow into a broker" guidance.
- **`resetDomainEvents` note** — test-seam function that drops all subscriptions; load-bearing across seven suites; ships to production.
- **Correlation-id table** — `request_id` (middleware) and `trace_id` (OTel ambient context) join every signal back together for cross-referencing.

## Relationships

- **`docs/tools/analytics.md`** — the detailed reference for `emitAnalyticsEvent` and the Umami/PostHog sink; this page defers product-analytics specifics there.
- **`docs/tools/frontend-observability.md`** — the detailed reference for `streamObservabilityMetrics` and the SSE endpoint consumed by the admin dashboard; this page lists it as one of the two process-boundary crossings.
- **`docs/tools/email-and-rendering.md`** — the detailed reference for `enqueueEmail` / `publishToQueue` and the RabbitMQ worker pipeline; this page lists it as the other process-boundary crossing.

## Notes

- **Pick by reader, not by event.** The page's single-rule summary: the correct signal is determined by who needs to see it, not what happened.
- **Only SSE and RabbitMQ can fail, retry, or arrive late.** The other five signals are one-way recordings; none of them should sit on a correctness-critical code path.
- **Audit vs. analytics overlap is intentional.** `USER_SIGNED_UP` (analytics) and `auth.signup.succeeded` (audit) fire on the same instant and answer different questions with different retention rules.
- **`src/infrastructure/**` is the bottom of the dependency graph.** It cannot import from `@modules/*`; the `IAuditSink` port + `app.ts` injection pattern (same shape as `IImageStore`) exists specifically to respect this boundary.
- **The domain event bus is not in the seven-signal table.** It is a call-graph device with no storage, no replay, and no durability; it is not an observability channel and must not be used to front a durable queue.
- **`resetDomainEvents` is load-bearing.** Seven test suites depend on it; removing it requires restructuring subscription ownership (bus-as-instance owned by the registry) and relocating `onDomainEvent`/`emitDomainEvent`.
