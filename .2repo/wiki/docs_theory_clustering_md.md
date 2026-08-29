# docs/theory/clustering.md

## Purpose

Explains the primary/worker clustering model and the graceful-shutdown sequence so a reader (human or AI) understands *why* the app forks one process per CPU core, how crash backoff works, and the exact order in which a worker tears down its resources on `SIGTERM`.

## Key elements

- **Primary process** (`src/cluster.ts`) – supervises the cluster: forks workers, watches exits, coordinates shutdown.
- **Worker process** (`src/app.ts`) – runs the full Express app; contains `stopServer` which defines the shutdown order (HTTP drain → `stopCache()` → `stopDatabase()` → `shutdownAnalytics()` → `shutdownTracing()`).
- **Configuration surface** – seven `NODE_CLUSTER_*` / `NODE_GRACEFUL_SHUTDOWN_*` env vars controlling worker count, crash-window, backoff base/max, and shutdown timeouts.
- **Crash backoff** – exponential (`base * 2^crashes`, capped) respawn delay with a sliding-window crash counter.
- **Graceful shutdown sequence** – SIGTERM → primary → worker → HTTP drain → cache/DB/analytics/tracing flush → `exit 0`; hard-killed if the timeout elapses.

## Relationships

- **`docs/theory/architecture.md`** – Linked as a related page; clustering is one component of the overall architecture described there.

## Notes

- Clustering is **opt-in**: `NODE_ENABLE_CLUSTERING` must be `1`; otherwise `src/app.ts` loads directly with no fork.
- Workers are **stateless** – no in-memory shared state; all mutable state lives in MongoDB or Redis. Cache invalidation is implicit because all workers address the same Redis keyspace.
- OTel tracing (`startTracing()`) must be initialised **before** any other import in both `src/cluster.ts` and `src/app.ts`.
- Background timers must be explicitly cleared in the stop functions, or the process will hang past the shutdown timeout.
