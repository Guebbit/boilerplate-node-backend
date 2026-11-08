---
source: tests/support/setup-environment-reset.ts
sha256: 84881e9c86e2bb53727305b504e8a669dec7e5b1eda7181b0547aea921bb916c
generated_at: 2026-11-08T09:59:39.248311+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-environment-reset.ts

## Purpose

A Jest `setupFilesAfterEnv` script that guarantees every test case in a file starts with the same environment-override state the file had at load time. Without it, an override left in place by one case silently leaks into all subsequent cases, making failures hard to attribute.

## Key elements

- **`markEnvironmentOverrides()`** (called once at module scope) — snapshots the set of environment overrides currently in place (established by the earlier `setup-file-sandbox.ts`) as the reset baseline.
- **`afterEach` hook** — after every test case (regardless of which `describe` block it lives in), calls:
  - `resetEnvironmentOverrides()` (from `@infrastructure/config/store`) to revert tracked overrides to the snapshot.
  - `restoreProcessEnvironment()` (from `./environment`) to undo any direct `process.env` mutations.

## Relationships

- **`src/infrastructure/config/store.ts`** — source of both `markEnvironmentOverrides` and `resetEnvironmentOverrides`; the actual override-tracking logic lives there.
- **`tests/support/environment.ts`** — provides `restoreProcessEnvironment`, a companion reset for mutations that bypass the store's tracking.
- Ordering: this file is listed in `setupFilesAfterEnv` *after* `setup-file-sandbox.ts`, so the sandbox has already populated the overrides that `markEnvironmentOverrides` captures.

## Notes

- The module has no explicit exports; its entire effect is the top-level `markEnvironmentOverrides()` call plus the `afterEach` registration.
- Because it runs at module scope (not inside a `describe`), the snapshot is taken exactly once per test file, before any test executes.
- The `afterEach` hook is registered at the top level, so it applies to every case in the file regardless of nesting depth.
