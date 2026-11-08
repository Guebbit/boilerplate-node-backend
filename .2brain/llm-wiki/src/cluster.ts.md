---
source: src/cluster.ts
sha256: 7e2feebb0104de8015cdd455b09d8b2af227685947e0d9d45374b80b9909cc34
generated_at: 2026-11-08T03:15:05.405415+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

The process entry point (declared in `package.json`) that enables Node.js cluster mode. Its critical job is to enforce initialization order—dotenv → Mongoose defaults → OTel instrumentation—before any application code loads, then either fork and supervise worker processes (primary) or serve the app (worker).

## Key elements

- **Top-level side-effect imports** — `dotenv`, `mongoose-boot`, and `startTracing()` execute in strict order before any other module is touched; this prevents OTel from missing express/mongoose patches.
- **`CLUSTER_ENABLED`** — reads `NODE_ENABLE_CLUSTERING` once at module scope; intentionally not overridable by tests after import.
- **`supervise()`** — the primary's full lifecycle: forks N workers, handles `exit` events with crash-window detection and exponential-backoff respawn, and performs coordinated SIGTERM → SIGKILL shutdown on signal or crash-limit exhaustion.
- **`forkWorker()` / `scheduleRespawn()` / `shouldRespawn()`** — internal helpers inside `supervise` for spawning, delayed respawn (timer `.unref()`'d), and filtering exits that must not be respawned (clean exit, SIGTERM/SIGINT, post-disconnect).
- **`startPrimaryShutdown(signal)`** — sends SIGTERM to all workers, then SIGKILL after `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS`; sets `process.exitCode` on forced timeout.
- **Entry fork (bottom of file)** — `cluster.isPrimary && CLUSTER_ENABLED` → primary path (lazy-imports `@app/config`, calls `assertProcessConfig()`, then `supervise()`); otherwise → worker path (dynamic `import('./serve')`, side-effect only).

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/config/dotenv.ts` | Imported first (side-effect); populates `process.env` before any config read. |
| `infrastructure/runtime/mongoose-boot.ts` | Imported second (side-effect); sets Mongoose connection defaults before any schema builds. |
| `infrastructure/runtime/otel-sdk.ts` | `startTracing()` is called at module top-level so OTel patches `http` before express loads. |
| `infrastructure/runtime/config.ts` | `clusterConfig()` supplies every `NODE_CLUSTER_*` value used by `supervise()`. |
| `infrastructure/runtime/cluster-policy.ts` | `workerTarget()` resolves the final worker count; `crashVerdict()` computes backoff delay or "give-up" from the crash window. |
| `infrastructure/adapters/logger.ts` | `logger` is used for all structured log output in the primary (fork, exit, shutdown, crash). |

## Notes

- **Import order is load-bearing.** Static imports are hoisted above statements, so `app.ts`'s own `startTracing()` call would run *after* express/mongoose are already loaded. This file calls `startTracing()` at top-level to guarantee it runs first.
- **`CLUSTER_ENABLED` is a module-level `const`.** It is read exactly once per process; no `createApp({ env })` override or test can change the primary/worker split after import.
- **Primary validates config before forking.** The lazy `import('@app/config')` + `assertProcessConfig()` ensures a bad env variable produces a single clean error instead of every worker crash-looping on it.
- **`process.exitCode ??= 0`** on all-workers-exited: a prior assignment (crash-limit failure or forced-timeout) is preserved; only a clean shutdown records `0`.
- **Stryker annotations** (`// Stryker disable … all`) suppress mutation testing on pure logging lines and the fork call to avoid false-positive surviving mutants.
