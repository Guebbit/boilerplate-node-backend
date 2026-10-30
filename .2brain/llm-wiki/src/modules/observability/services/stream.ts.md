---
source: src/modules/observability/services/stream.ts
sha256: e6c55ef091ada168901e5f3d3b188e181da133b7be90530a76e66eed9f63b988
generated_at: 2026-10-29T04:36:28.164284+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/stream.ts

## Purpose

Serves live observability metrics to browser dashboards over Server-Sent Events (one-way, plain HTTP, auto-reconnecting via `EventSource`). It composes process memory, HTTP counters, and connection counts into a single payload and pushes it on a fixed cadence, plus a slower heartbeat to survive idle-proxy timeouts.

## Key elements

- **`buildObservabilityPayload()`** — Returns a `Promise<ObservabilityMetricsPayload>` with timestamp, uptime, memory (raw bytes), cumulative HTTP request/error counts, and the current `sseClients.size`. This is the single source of truth for one frame's data.
- **`streamObservabilityMetrics(response, reverify)`** — The public entry point called by a route handler. Opens the SSE connection via `openSseStream`, registers the response in `sseClients`, sends an immediate `METRICS_SNAPSHOT` frame, then schedules `METRICS_UPDATED` (5 s) and `HEARTBEAT` (15 s) intervals. Cleans up all intervals and the Set entry on close.
- **`sseClients`** (module-level `Set<Response>`) — Tracks active SSE connections for this process; also exposed in the payload's `realtime.sseClients` field as a self-monitoring signal.
- **`writeEvent`** / **`writeMetricsEvent`** (internal) — Low-level SSE frame writer and its fire-and-forget wrapper. `writeMetricsEvent` intentionally swallows all rejections (`void … .catch(() => undefined)`) so a single bad write never tears down the interval or crashes the process.
- **`UPDATE_INTERVAL_MS`** (5 000) / **`HEARTBEAT_INTERVAL_MS`** (15 000) — Timing constants; heartbeat is deliberately slower than updates and slower than typical proxy idle timeouts (30–60 s).

## Relationships

- **`src/infrastructure/http/sse.ts`** — Provides `openSseStream`, which sets SSE headers, exposes an `onClose` hook, and polls the `reverify` callback. `streamObservabilityMetrics` delegates all connection-lifecycle concerns to it.
- **`src/modules/observability/http-readback.ts`** — Supplies `getHttpRequestCounters()` (cumulative request/error totals) that are embedded in every payload frame.
- **`src/modules/observability/services/process-snapshot.ts`** — Supplies `processSnapshot()` (uptime + memory fields) read synchronously before the async counter read so all numbers in one frame reflect roughly the same instant.
- **`src/types/index.ts`** — Source of `OBSERVABILITY_CHANNELS` (string constants shared with `asyncapi.yaml`), `ObservabilityMetricsPayload`, and `ObservabilityChannel`.
- **`src/modules/observability/services/index.ts`** — Barrel that re-exports `buildObservabilityPayload` and `streamObservabilityMetrics` for route handlers and tests.
- **`src/modules/observability/tests/unit/stream.test.ts`** — Unit tests covering this module's exported functions.

## Notes

- **Per-process state.** `sseClients` is not shared across cluster workers; each worker tracks only its own SSE connections. The `realtime.sseClients` number in the payload is therefore per-process, not fleet-wide.
- **Client-side differencing.** The server sends cumulative counts (`totalRequests`, `totalErrors`) and raw byte memory values. The dashboard is responsible for computing rates by subtracting consecutive frames — the server never rounds or pre-computes deltas.
- **Auth-agnostic by design.** `reverify` is a plain `() => Promise<boolean>` callback, not a specific authorization call. The route layer wires it to the appropriate middleware (e.g. cookie-based rule check), keeping this module free of auth imports.
- **SSE wire format is strict.** Each frame must end with `\n\n`; omitting it causes the client's `EventSource` to buffer indefinitely. Payloads are single-line (guaranteed by `JSON.stringify`).
- **Heartbeat is a real event, not an SSE comment (`: ping`).** This lets the client treat it as a liveness signal and still run its normal `onmessage` handler.
