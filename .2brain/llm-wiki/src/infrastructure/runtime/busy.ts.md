---
source: src/infrastructure/runtime/busy.ts
sha256: 7dd26e9d901707137b9584548e5fe0904393e102f6d4c714fb002e61563a3f24
generated_at: 2026-10-14T08:12:35.049316+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/busy.ts

## Purpose

Defines a single error type, `ServiceBusyError`, representing the condition "the server is at its limit and will not queue this request." It exists so that any adapter can signal a full bounded queue, and the HTTP layer can uniformly map that signal to a **503 Service Unavailable** with a `Retry-After` hint—semantically identical to an unreachable dependency. Placing the class under `runtime/` lets adapters throw it and the HTTP layer recognise it without a direct import in either direction.

## Key elements

- **`ServiceBusyError`** (exported class, extends `Error`) — Thrown when a bounded queue is full and no work was started. The constructor accepts a single `message` string that names *what* was full (e.g. the adapter or queue name) for log-line clarity. Sets `this.name = 'ServiceBusyError'`.
- **Module docblock** — Documents the intended HTTP mapping (503 + `Retry-After`) and the RFC 9110 §15.6.4 distinction: the server is *temporarily unable*, not *refusing*.

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP layer checks for `ServiceBusyError` (alongside other infrastructure errors via `isInfrastructureError`) and responds with 503 + `Retry-After`. This file's docblock explicitly references `http/errors.ts#isInfrastructureError` as the companion path.
- **`src/infrastructure/adapters/pdf.ts`** — An adapter that throws `ServiceBusyError` when its internal queue is saturated, delegating the 503 mapping to the HTTP layer.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — Exercises the PDF adapter's queue-full path, asserting `ServiceBusyError` is thrown.
- **`tests/unit/infrastructure/http/errors.test.ts`** — Verifies the HTTP layer maps `ServiceBusyError` (and peer errors) to the correct 503 + `Retry-After` response.
- **`src/modules/invoicing/tests/integration/download.test.ts`** — Integration-level test covering the busy/queue-full scenario in the invoicing download flow.

## Notes

- The error is **not** a refusal (4xx). It signals transient unavailability; the same request is expected to succeed on retry. Do not conflate with a rate-limit or permission error.
- Because the class lives in `runtime/`, neither adapters nor the HTTP layer need to import each other—only this shared leaf—to achieve the throw/recognise pattern.
- The `message` parameter is purely descriptive (naming the full resource); it is not parsed or matched on downstream. Keep it specific for log readability.
