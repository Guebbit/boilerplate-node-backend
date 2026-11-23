---
source: src/app/process-boot.ts
source_sha256: 27efc6308ba3433e8dbe117a076a5799a168834552a2f3e3d43d6d8a33ee2cb3
context_sha256: 56c149809e05989e35de16fb7c04f34a97495731df5eb847d1e2463e694dc915
generated_at: 2026-11-22T02:30:55.181875+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/process-boot.ts

## Purpose
Holds the boot and teardown sequence shared by the web process and the worker process, so the two cannot drift: a step added for one is a step the other gets. It connects the stores and queue, sets up rendering and validation messages, and provides the graceful stop. It does not bind queue consumers (the worker's last step) or open a listener (each process does that itself).

## Key elements
- **`bootProcess(): Promise<void>`**: runs a sequential promise chain:
  1. `startDatabase()`
  2. `startCache()`
  3. `startQueue()` (publishing only; consuming is the worker's job)
  4. `registerImageWriteback()`
  5. `bootRendering()` (files, templates, then admin edits)
  6. `startLocaleOverrideRefresh()`, only if `isLocaleOverrideAvailable()`
  7. `registerValidationMessages()`

  It rejects if a store cannot connect.
- **`createStop(currentServer, afterStop): () => Promise<void>`**: returns the `stop` function the process hands to its signal handlers.
  - It calls `shutdownInfra` with the server from `currentServer()`. The listener drains first, then stores close in reverse of startup.
  - Before closing, it waits (via `settleWithin`) for in-flight outbox relay nudges (`settleOutboxNudges()`).
  - `afterStop` runs when teardown settles, so the caller can forget the listener.

## Relationships
- **`./boot-rendering`**: `bootRendering()` is called as the rendering step. Per the comments, it is the same step every scheduled job runs.
- **`./workers`**: provides `registerImageWriteback()`. It is registered for both roles, since the web process runs the digest job inline when the broker is unconfigured or down.
- **`@infrastructure/runtime/database`, `adapters/cache`, `adapters/queue`**: the stores and queue started in order.
- **`@infrastructure/i18n`**: `isLocaleOverrideAvailable` and `startLocaleOverrideRefresh` handle locale overrides.
- **`@infrastructure/http/validation-messages`**: `registerValidationMessages` runs last, after i18n.
- **`@infrastructure/runtime/server-lifecycle`**: `shutdownInfra` does the actual teardown in `createStop`.
- **`@infrastructure/runtime/settle`**: `settleWithin` bounds the wait for outbox nudges.
- **`@kernel/outbox`**: `settleOutboxNudges` supplies the in-flight relay passes to wait on.
- **`src/app/worker-process.ts` and `src/app.ts`**: the two processes this module is shared between. The file itself does not import them.
- **`tests/unit/app/process-boot.test.ts`**: unit tests for this module.

## Notes
- **Order matters.** Validation messages must register after i18n, because the message map resolves its copy through `t`. The locale refresh timer is skipped when no provider exists (`locales` uninstalled), since it would poll nothing.
- **Stop is idempotent.** A second call while shutdown is in progress returns the same promise. The in-flight promise is cleared in `finally`, after `afterStop()`.
- **Why wait for nudges.** A relay pass that is lost is only published a minute later by the sweep, but one cut mid-write logs errors at every deploy.
