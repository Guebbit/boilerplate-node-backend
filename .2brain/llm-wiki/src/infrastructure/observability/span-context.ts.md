---
source: src/infrastructure/observability/span-context.ts
source_sha256: 8c060f92b18bbe1293e14f6491fff36ccd00b709ac2470a457d99db0f5300b00
context_sha256: bc46c99478010ff5bbf8ea0233040b79dbaa458afdd8b2f256d24be3180f177e
generated_at: 2026-11-22T03:00:47.764374+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/span-context.ts

## Purpose
Exposes the identity (trace ID and span ID) of the currently active OpenTelemetry span, so anything that writes data can stamp the same trace ID onto it. This is what lets logs, audit rows and analytics events be correlated across signals. The file deliberately uses relative imports and depends only on the OTel API, because `src/infrastructure/adapters/logger.ts` imports it and it sits on jest `globalSetup`'s own import chain.

## Key elements
- `getActiveSpanContext()`: returns `{ traceId, spanId }`, each `string | undefined`. It reads `trace.getActiveSpan()` from OTel's async context (AsyncLocalStorage), so no span has to be passed through function signatures. If there is no active span, both fields are `undefined`. Otherwise it reads `spanContext()` and returns each ID only if it is valid.
- `isValidOtelId` (private): treats an empty string or an all-zeros ID as absent. OTel uses all-zeros IDs for no-op or invalid spans.

## Relationships
- `src/infrastructure/adapters/logger.ts`: imports this module to attach trace identity to log lines. This is the reason the module must stay lightweight.
- `src/infrastructure/observability/audit.ts` and `src/infrastructure/observability/analytics/index.ts`: the file's own docs say audit rows and analytics events stamp the same `traceId`, so these are the consumers that write it.
- `tests/unit/infrastructure/observability/tracer.test.ts`: test neighbor in the graph. It is likely exercising the tracing setup that this module reads from.

## Notes
- Without a started SDK (tests, or before startup), `trace.getActiveSpan()` yields no usable span, so IDs come back `undefined` rather than all-zeros placeholders.
- `traceId` and `spanId` are validated independently, so one can be `undefined` while the other is set.
- Don't add non-OTel-API or non-relative (aliased) imports here: it is loaded very early, including by jest `globalSetup`.
