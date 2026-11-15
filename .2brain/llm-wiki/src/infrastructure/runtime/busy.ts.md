---
source: src/infrastructure/runtime/busy.ts
sha256: c43241ebb9d0f998683457c63e8c019f7b0d2023575e233d6a3cbf7b9350c032
generated_at: 2026-11-14T18:15:46.089598+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/busy.ts

## Purpose

Defines `ServiceBusyError`, a single sentinel error representing "bounded queue is full." It exists so that an adapter (producer side) can signal "server at its limit, will not queue this" and the HTTP layer can map it to a **503 + `Retry-After`** response — the same shape as an unreachable dependency or a time-limited query kill — without the two layers importing each other.

## Key elements

- **`ServiceBusyError`** (exported class, extends `Error`) — thrown when a bounded queue is full and no work was started. Constructor takes a `message` string naming *what* was full, intended for the log line. Sets `this.name = 'ServiceBusyError'`.

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP layer recognises `ServiceBusyError` (via `isInfrastructureError`) and responds with 503 + `Retry-After`. This is the "consumer" side of the error.
- **`src/infrastructure/adapters/pdf.ts`** — An adapter that can *throw* `ServiceBusyError` when its bounded work queue is full. The file lives under `runtime/` specifically so this dependency direction works without a circular import.
- **`tests/unit/infrastructure/http/errors.test.ts`** — Exercises the mapping of `ServiceBusyError` to the 503 response shape.
- **`tests/unit/infrastructure/adapters/pdf.test.ts`** — Exercises the adapter path that throws `ServiceBusyError`.
- **`src/modules/invoicing/tests/integration/download.test.ts`** — Integration-level test that likely asserts the end-to-end 503 behaviour when the queue is full.

## Notes

- This is intentionally a **one-class file**. The design goal (stated in the module doc) is decoupling: adapters import `runtime/busy.ts` and throw; the HTTP layer imports it and recognises. Neither side imports the other's module.
- Semantics per the doc: the request is **not refused** (RFC 9110 §15.6.4). The server is *temporarily* unable; the same request may succeed shortly. Do not conflate with a 4xx rejection.
- Only one instance of "busy" is modelled here. If a new bounded-queue source appears, it should throw the same `ServiceBusyError` rather than introducing a sibling class.
