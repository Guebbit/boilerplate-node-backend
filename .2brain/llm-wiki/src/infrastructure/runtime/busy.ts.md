---
source: src/infrastructure/runtime/busy.ts
sha256: 7dd26e9d901707137b9584548e5fe0904393e102f6d4c714fb002e61563a3f24
generated_at: 2026-11-08T03:45:53.883978+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/busy.ts

## Purpose

Defines `ServiceBusyError`, a single error type representing "a bounded queue is full; nothing was started, but the same request may succeed shortly." It exists under `runtime/` so that any adapter can throw it and the HTTP layer can recognize it without either side importing the other.

## Key elements

- **`ServiceBusyError`** — Extends `Error`. Constructor takes a `message` string (intended to name *what* was full, for the log line) and sets `this.name = 'ServiceBusyError'`. No additional fields or methods.

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP layer recognizes this error (alongside other infrastructure errors via `isInfrastructureError`) and responds with **503** plus a `Retry-After` header. The semantic is "the server is temporarily unable," not a client refusal (RFC 9110 §15.6.4).
- **`src/infrastructure/adapters/pdf.ts`** — An adapter that can throw `ServiceBusyError` when its bounded work queue is full.
- **`tests/unit/infrastructure/http/errors.test.ts`** — Verifies the 503 / `Retry-After` mapping for this error.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — Exercises the adapter path that raises the error.
- **`src/modules/invoicing/tests/integration/download.test.ts`** — Integration-level test that can drive the queue-full scenario end-to-end.

## Notes

- The file intentionally contains **only** the error class—no retry logic, no queueing, no HTTP mapping. Those live in their respective layers.
- The placement under `runtime/` (not `adapters/` or `http/`) is a deliberate dependency-direction choice: both the adapter side and the HTTP side may import it, but neither imports the other.
- The message passed to the constructor is meant for **server-side logging**; it is not documented as a user-facing contract.
