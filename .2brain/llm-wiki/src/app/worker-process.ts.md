---
source: src/app/worker-process.ts
source_sha256: a5a3c9186b01a3353229ec6e2b48d5d32d587bf60d86f39225bdea7eea41e99b
context_sha256: aac38a6ee4cc28e040dd9048b6735273c4da1ecf19e9066ead6e80cb7787aac4
generated_at: 2026-11-22T02:32:07.444758+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/worker-process.ts

## Purpose
Entry point for the worker process, one copy per `worker` service. It consumes jobs from the broker (sending emails, digesting images, delivering webhooks) and runs a small HTTP listener for the container health check and the Prometheus scrape. The web process only publishes jobs. The worker does not serve the API's routes, run the scheduler (`cron` does) or hold the rate-limit store.

## Key elements
- **`WorkerInstance`**: the interface `createWorker` returns:
  - `boot()` connects and binds every consumer without opening the listener.
  - `start()` runs `boot`, then opens the listener and resolves with the `Server`.
  - `stop()` is a graceful shutdown: stop consuming, let running jobs settle, close the stores.
- **`createWorker()`**: builds the worker synchronously. It calls `registerModules(enabledModules, APP_CONFIG_SLICES)` immediately. Connecting and consuming wait for `boot`/`start`. It tracks the opened listener in a local `activeServer`.
- **`bootWorker`** (private): runs `bootProcess()`, then `registerWorkers()`.
- **`createWorkerApp`** (private): builds the Express app for the listener:
  - `helmet()` and a `Cache-Control: no-store` header on every response.
  - `GET /livez`, which returns plain-text `ok`.
  - Every module's `workerMounts` (`basePath` and `routes`), which is where the Prometheus scrape comes in.
  - A final 404 handler that calls `rejectResponse(response, 404)`, so the response is problem-details rather than Express's HTML page.

## Relationships
- `src/app/process-boot.ts`: `bootProcess` is the same boot the web process uses (stores, queue, translations, mail templates, admin copy). `createStop` builds `stop` from the active-server getter and reset callback.
- `src/app/workers.ts`: `registerWorkers` binds the consumers, as the last boot step.
- `src/app/config.ts`: `APP_CONFIG_SLICES` is passed to `registerModules`.
- `src/modules.ts`: `enabledModules` supplies the modules to register and their `workerMounts`.
- `src/kernel/registry.ts`: `registerModules` registers the modules (event subscriptions and the config gate).
- `src/infrastructure/runtime/config.ts`: `serverConfig().NODE_WORKER_PORT` is the listener port.
- `src/infrastructure/runtime/server-lifecycle.ts`: `listenOn` opens the listener.
- `src/infrastructure/http/response.ts`: `rejectResponse` produces the 404.
- `src/infrastructure/adapters/logger.ts`: logs "Worker listening on port …".
- `tests/unit/app/worker-process.test.ts`: unit tests for this file.

## Notes
- Consumers bind last on purpose. A job taken before i18n is up would render a translation key instead of a sentence.
- Modules register in `createWorker`, before `boot`. `bootProcess` runs after registration.
- The listener binds on every interface, not loopback, because the scraper reaches the worker over the network. The only routes are the liveness probe and the token-guarded scrape.
- `/livez` reports that the process answers, never the state of a dependency.
- The worker has no session, rate limit or locale handling.
