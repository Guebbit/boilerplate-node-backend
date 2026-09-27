---
source: tests/cross-cutting/process-snapshot.test.ts
sha256: 33bcf41f8491ede66859f1884758bbd347ff17223141f42fd9d81c94e501eedb
generated_at: 2026-09-27T15:51:57.810654+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/process-snapshot.test.ts

## Purpose

A structural (cross-cutting) test that enforces two invariants on the process-snapshot data: (1) `process.memoryUsage()` and `process.uptime()` may only be read from a small allowlisted set of files, and (2) the memory and uptime fields are declared identically (name, order, type, bounds) in both `openapi.yaml` and `asyncapi.yaml`. It exists to close the gap where three independent readings of the same process state can silently drift apart.

## Key elements

- **`ALLOWED_READERS`** — a `Record<string, string>` mapping source-relative file paths to a one-line justification for why that file may call `process.memoryUsage()` / `process.uptime()` directly. Currently lists the shared reader itself and the prom-client Gauge.
- **`listSourceFiles(dir)`** — recursively walks a directory and returns all `.ts` file paths.
- **`relativeToSource(file)`** — converts an absolute path to a forward-slashed, `src/`-relative key so allowlist lookups are platform-independent.
- **`at(root, …keys)`** — walks a parsed YAML/JSON object by key path; returns `undefined` on a missing step (never throws).
- **`propertyNames(node)`** — returns `Object.keys(node.properties)` in declaration order, or `[]` if the node is absent.
- **`describe('the process snapshot')`** block containing five tests:
  1. *Canary* — asserts the source sweep found >100 files (guards against an empty walk passing all other assertions).
  2. *Single-reader* — scans every `.ts` file for literal `process.memoryUsage(` / `process.uptime(` and fails if found outside `ALLOWED_READERS`.
  3. *No stale exemptions* — asserts every key in `ALLOWED_READERS` still corresponds to a real file on disk.
  4. *Schema parity* — asserts `ProcessMemory` (OpenAPI) and `memory` (AsyncAPI) have identical property names `[rss, heapUsed, heapTotal, external]` and both set `additionalProperties: false`.
  5. *Uptime typing* — asserts every `uptimeSeconds` declaration across both documents is `type: integer` with `minimum: 0`.

## Relationships

- **`tests/support/paths.ts`** — provides `REPO_ROOT`, used to anchor every `readFileSync` / `readdirSync` call so the test resolves paths relative to the repository root regardless of the working directory.

## Notes

- This is a **source-tree / schema lint**, not a unit test of a function. It reads `.ts` files and two YAML documents directly from disk at test time.
- The prom-client Gauge in `metrics-registry.ts` is explicitly allowed to read `process` because its `collect()` callback fires at scrape time; routing it through the shared reader would change *when* the values are sampled.
- The allowlist is a **map**, not an array, so each exemption carries its own inline justification and a deleted/renamed file is caught by test 3.
- Property **order** is asserted (via `toEqual` on the name array), not just set membership, because consumers read the fields side-by-side.
- The `at()` helper deliberately returns `undefined` rather than throwing, so a renamed schema path produces a readable `expect(…).toBeDefined()` failure instead of a mid-chain `TypeError`.
