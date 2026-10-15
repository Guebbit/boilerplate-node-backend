---
source: scripts/ops/reap-orphaned-images.ts
sha256: f904971bee0a588baf1380a5be0c7b00dafa873dc686d948a3dffb94fe15875a
generated_at: 2026-10-15T09:44:27.115495+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-orphaned-images.ts

## Purpose

CLI script that deletes stored images (and their thumbnails) no longer referenced by any current document. Exists to reclaim disk space from stale uploads after deletions, demos, or e2e cycles. Scheduled nightly via `docker/crontab`; also invocable manually with `npm run reap:orphaned-images`.

## Key elements

- **`main`** (local, unexported) — Opens a DB job via `startJob()`, calls `reapOrphanedImages` with the collection names derived from `Object.keys(resolveImageTargets(enabledModules))`, then resolves. No explicit DB close here; teardown is delegated to `runScript`.
- **Entry point** — `void runScript('reap:orphaned-images', main, stopDatabase)` records the run's outcome under the key `reap:orphaned-images` (for `/observability/health`) and guarantees `stopDatabase` is called on both success and failure paths.
- **Import ordering** — `dotenv` and `mongoose-boot` are imported before any model-bearing module, because Mongoose defaults are read at schema build time.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/run-script.ts` | Supplies `runScript`, which wraps execution, records the outcome for observability, and ensures `stopDatabase` runs on both paths. |
| `src/infrastructure/adapters/orphaned-images.ts` | Supplies `reapOrphanedImages` — the actual sweep-and-delete logic (what it deletes, what it spares). |
| `src/infrastructure/config/dotenv.ts` | Loaded first so `process.env` is populated before any other import runs. |
| `src/infrastructure/runtime/mongoose-boot.ts` | Loaded second; sets Mongoose connection defaults before any schema is built. |
| `src/infrastructure/runtime/database.ts` | `startJob` (used by `main`) opens the connection; `stopDatabase` is passed to `runScript` for guaranteed teardown. |
| `src/kernel/registry.ts` | `resolveImageTargets(enabledModules)` returns the map of collection names to sweep, so new image-bearing modules are picked up automatically. |
| `src/modules.ts` | `enabledModules` is the list of active modules fed into `resolveImageTargets`. |

## Notes

- **No per-collection hard-coding.** The set of collections to sweep is derived entirely from `resolveImageTargets(enabledModules)`. Adding a new module that stores images requires zero changes here.
- **Import order is load-bearing.** Swapping `mongoose-boot` after a model import would read stale defaults at schema-build time.
- **The script passes *keys* (collection name strings), not the full target descriptors**, to `reapOrphanedImages` — the adapter is responsible for interpreting them.
- Intended to run as a short-lived job; `startJob` implies a single-connection, single-run lifecycle (distinct from a long-lived server connection).
