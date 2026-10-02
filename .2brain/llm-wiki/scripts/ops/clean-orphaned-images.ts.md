---
source: scripts/ops/clean-orphaned-images.ts
sha256: 3fae42b0bc483ef37f9916b674a1e747a5d79b0c0d81bc4f045f0ccb024cbed2
generated_at: 2026-10-01T12:34:10.945692+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/clean-orphaned-images.ts

## Purpose

Manual dev-hygiene CLI (`npm run clean:orphaned-images`) that deletes image files and their thumbnails from the persistent `public/images/` directory which no live document references. It exists because the ephemeral in-memory Mongo is re-seeded on every dev/e2e cycle while uploads still land on the host's persistent filesystem, so orphans accumulate indefinitely unless cleaned by hand.

## Key elements

- **`referencedFilenames(): Promise<Set<string>>`** — Queries every `imageTargets`-registered collection via the raw Mongoose driver, collects all `imageUrl` / `thumbnailUrl` basenames currently in use, and returns them as a `Set<string>` (basenames only, not full paths).
- **`main(): Promise<void>`** — Orchestrates the run: starts the DB connection, builds the keep-set, calls `pruneUnreferenced` on the `images/` and `images/thumbs/` directories, and logs checked/reaped counts.
- **Module invocation** — `void runScript(undefined, main, stopDatabase)` wires the script into the project's standard CLI lifecycle.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` wrapper that handles argument parsing, error catching, and graceful shutdown around `main`.
- **`src/infrastructure/adapters/filesystem.ts`** — Supplies `pruneUnreferenced`, the actual function that walks a directory and deletes files not in the keep-set.
- **`src/infrastructure/adapters/image-store.ts`** — Exports `IMAGES_SEGMENT`, `publicRoot`, and `thumbnailsDirectory` used to locate the two directories to scan.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` for the final summary line.
- **`src/infrastructure/runtime/database.ts`** — Provides `start` / `stopDatabase` for the Mongoose connection lifecycle.
- **`src/kernel/registry.ts`** — `resolveImageTargets(enabledModules)` yields the list of collection names that carry image fields, making the script generic across future modules.
- **`src/modules.ts`** — Supplies the `enabledModules` array passed to `resolveImageTargets`.

## Notes

- Deletion is **reference-based, not age-based** (unlike `reap-quarantine.ts`). A promoted image is durable by design; only the absence of a live DB reference justifies removal.
- `pruneUnreferenced` touches only files *directly* under the directory it is given — subdirectories like `images/seed/` and `images/system/` are never modified.
- Reads use the **raw driver** (`mongoose.connection.db.collection(...)`) rather than any module's repository, because the script must reach every registered collection generically without importing module-specific code.
- The `Stryker disable next-line all` comment indicates mutation-testing is configured to skip the logger call in `main`.
