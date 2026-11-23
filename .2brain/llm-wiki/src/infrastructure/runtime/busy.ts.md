---
source: src/infrastructure/runtime/busy.ts
source_sha256: c43241ebb9d0f998683457c63e8c019f7b0d2023575e233d6a3cbf7b9350c032
context_sha256: a61ebda4e5b86b379a1e32f8aea617dbcdc137512c1eb3b623d2c2b4297318d6
generated_at: 2026-11-22T03:05:34.689596+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/busy.ts

## Purpose
Defines `ServiceBusyError`, the single error used when the server is at its limit and will not queue a request because a bounded queue is full. It is meant to be answered as a 503 with a `Retry-After` hint, the same as an unreachable dependency or a query killed at its time limit. The server is temporarily unable; the request itself is not refused (RFC 9110 §15.6.4). It sits under `runtime/` so adapters can throw it and the HTTP layer can recognise it without importing each other.

## Key elements
- `ServiceBusyError` (extends `Error`): constructor takes a `message` that names what was full, for the log line. It sets `name` to `'ServiceBusyError'`. Nothing was started, and the same request may succeed shortly.

## Relationships
- `src/infrastructure/adapters/pdf.ts`: an adapter of the kind this file is designed for, one that throws the error.
- `src/infrastructure/http/errors.ts`: the HTTP layer, which recognises the error and maps it to a 503. The doc comment refers to `isInfrastructureError` in this file.
- `tests/unit/infrastructure/adapters/pdf.test.ts`, `tests/unit/infrastructure/http/errors.test.ts` and `src/modules/invoicing/tests/integration/download.test.ts`: tests that cover the adapter side, the HTTP mapping, and the invoicing download path.

## Notes
- The class has no fields beyond `message` and `name`, so the `Retry-After` value is not carried by the error. It has to be decided by the HTTP layer.
- Its only job is to be a shared type that both layers can use without a direct dependency.
