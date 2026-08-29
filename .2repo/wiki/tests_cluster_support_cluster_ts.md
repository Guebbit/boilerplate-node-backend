# tests/cluster/support/cluster.ts

## Purpose

Test-support harness that boots the real multi-process cluster (`src/cluster.ts` via `npx tsx`) with its own in-memory MongoDB and a random free port, then exposes helpers for talking to the workers over TCP. It exists because every other suite in the repo runs the app in a single process (supertest), which structurally cannot observe state that is correct per-worker but broken across the cluster (e.g. a per-process counter).

## Key elements

- **`Cluster`** (interface) — `{ port, stop }`; the handle returned by `startCluster`.
- **`freePort()`** (internal) — binds a throwaway server to port `0`, reads back the OS-assigned port, closes it. Avoids `EADDRINUSE` from picking a fixed number.
- **`waitForListening(port, timeoutMs)`** (internal) — retries TCP-connect to `127.0.0.1:port` every 250 ms until something accepts or the deadline passes.
- **`startCluster({ workers, env, bootTimeoutMs })`** (exported) — spins up `MongoMemoryServer`, allocates a free port, spawns `npx tsx src/cluster.ts` with the required env vars, waits for the port to be ready, and returns a `Cluster`. On boot timeout it tears down and re-throws.
- **`getOnFreshConnection(port, url)`** (exported) — performs a single HTTP GET on a brand-new socket (`agent: false`, `Connection: close`) and resolves with the status code. Deliberately bypasses `fetch`/keep-alive so each request is a distinct connection.
- **`tally(statuses)`** (exported) — counts occurrences of each HTTP status in an array; returns a `Record<number, number>`.

## Relationships

- **`tests/cluster/rate-limit.test.ts`** — the primary consumer; calls `startCluster` to fork multiple workers and uses `getOnFreshConnection` + `tally` to verify that rate-limit counters are truly shared across processes.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — uses the same boot helpers to confirm search-contract behaviour is consistent whether the app runs clustered or not.
- **`scripts/run-prism-smoke-test.ts`** — invokes the cluster boot path as a smoke check before wider test runs.

## Notes

- `NODE_ENV` is set to `'development'`, **not** `'test'`. Under `test`, `src/app.ts` skips `startServer()`, so forked workers would mount the Express app but never bind a port.
- `NODE_ENABLE_CLUSTERING` must be `'1'` for the child to actually fork; setting only `NODE_CLUSTER_WORKERS` has no effect. Forgetting this makes every cross-worker assertion pass vacuously.
- `getOnFreshConnection` is the critical helper: the cluster load-balancer distributes **connections**, not individual requests. Node's `fetch` (and any keep-alive agent) would pin a burst of requests to one worker, making a per-process counter look shared. `agent: false` + `Connection: close` guarantees each call is a new socket.
- `stop()` sends `SIGTERM`, gives the primary 10 s to drain workers, then `SIGKILL`s. The 10 s timer is `.unref()`'d so it never keeps the test process alive.
- All child `stdio` is piped to `ignore`; the cluster's own logs are intentionally invisible to the test runner.
