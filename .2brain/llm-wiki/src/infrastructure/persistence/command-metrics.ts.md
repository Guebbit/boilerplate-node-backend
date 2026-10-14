---
source: src/infrastructure/persistence/command-metrics.ts
sha256: 87c54f0a0a401d8c58b05cd8237c6a7339f6513c51974d0c1d49424f3299cfcb
generated_at: 2026-10-14T08:08:17.146779+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/command-metrics.ts

## Purpose

Provides a Prometheus histogram that records the latency of every MongoDB command issued through a connection, using the driver's built-in command-monitoring events. Because the driver sees commands regardless of the code path (repository method, direct model call, aggregate), the metric captures full coverage with no double-counting. It feeds the `GET /observability/metrics/overview` endpoint.

## Key elements

- **`databaseOperationDuration`** (exported `Histogram`) — Prometheus histogram named `db_client_operation_duration_seconds` (OpenTelemetry semantic-convention name). Labels: `collection`, `operation`, `outcome`. Buckets span 1 ms → 5 s. Registered on `metricsRegistry`.
- **`observeDatabaseCommands(connection)`** (exported) — Attaches `commandStarted` / `commandSucceeded` / `commandFailed` listeners to the underlying driver `Client`. Idempotent via a `WeakSet`; safe to call multiple times on the same client. Tracks in-flight commands in a `Map<requestId, PendingCommand>` and records duration on completion.
- **`collectionOf(event)`** (internal) — Resolves the target collection from a `CommandStartedEvent`. Handles `getMore` (collection lives under `.collection` rather than the command-name key) and falls back to `'none'` for session/transaction commands.

## Relationships

- **`@infrastructure/observability/metrics-registry`** — The histogram is registered against the shared `metricsRegistry` singleton, so it appears in the global Prometheus output and the overview endpoint.
- **`runtime/database.ts`** — The connection passed to `observeDatabaseCommands` must have been opened with the `COMMAND_MONITORING` option (set in `database.ts`); otherwise the driver emits no events and the histogram stays empty.
- **`tests/integration/persistence/command-metrics.test.ts`** — Integration tests verifying end-to-end command timing.
- **`tests/unit/infrastructure/runtime/database.test.ts`** — Unit tests confirming the `COMMAND_MONITORING` flag is applied at connection time.
- **`tests/support/database.ts`** — Test helper that provides the connection objects used in the above tests.

## Notes

- **Idempotency guard** uses a `WeakSet` keyed on the driver `Client` object. If a test or caller re-invokes `observeDatabaseCommands` with a *different* `Connection` wrapper around the *same* client, the guard still prevents duplicate listeners.
- **`getMore` quirk:** the `commandName` is `getMore` but the collection name is stored under `event.command.collection`, not `event.command.getMore`. The `collectionOf` helper handles this; any new code reading the command object directly should account for it.
- **Duration unit:** the driver reports `duration` in **milliseconds**; the histogram stores **seconds** (divided by 1000).
- **Pending map hygiene:** entries are removed on *both* `commandSucceeded` and `commandFailed`, so the map only ever holds in-flight commands. A missing `requestId` (e.g., event fired before `commandStarted`) is a silent no-op.
