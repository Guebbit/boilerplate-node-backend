# tests/cross-cutting/process-snapshot.test.ts

## Purpose

A cross-cutting invariant test that enforces two architectural rules about process metrics: (1) only a whitelisted set of files may call `process.memoryUsage()` / `process.uptime()` directly, and (2) the `ProcessMemory` schema declared in `openapi.yaml` and `asyncapi.yaml` must stay structurally identical (same fields, same order, both closed). It exists because a prior refactor consolidated three divergent reads into one shared reader, but nothing mechanically prevents a fourth direct read or a silent schema drift between the two API documents.

## Key elements

- **`ALLOWED_READERS`** – Map of repo-relative paths to a human-readable justification. Only `process-snapshot.ts` (the shared reader) and `metrics-http.ts` (a prom-client Gauge that must read at scrape time) are exempt.
- **`listSourceFiles`** – Recursively enumerates all `.ts` files under `src/`.
- **`relativeToSource`** – Normalises a file path to a forward-slashed, `src/`-relative string so allowlist keys are platform-stable.
- **`at`** – Walks a parsed YAML/JSON object by a sequence of keys; returns `undefined` on a missing step instead of throwing, letting callers assert definedness with a readable failure message.
- **`propertyNames`** – Extracts the declaration-order keys of a JSON-Schema `properties` node.
- **Test: "sweeps a source tree that actually has files in it"** – Canary assertion (≥ 100 files) so an empty tree doesn't vacuously pass the remaining checks.
- **Test: "is the only place … are read"** – Scans every source file for the two `process.*` calls and asserts none appear outside the allowlist.
- **Test: "keeps every allowlisted reader real"** – Verifies each key in `ALLOWED_READERS` still corresponds to an existing file, preventing a stale exemption from silently widening the rule.
- **Test: "publishes the same memory block …"** – Compares the `ProcessMemory` schema (REST) against the `memory` sub-schema (SSE) for identical property names **and order**, and asserts both have `additionalProperties: false`.
- **Test: "types every published uptime as a non-negative integer"** – Confirms all three `uptimeSeconds` declarations across the two YAML documents specify `type: integer` and `minimum: 0`.

## Relationships

The test does not import application code; it reads source files and YAML documents directly from the filesystem.

- **`src/infrastructure/observability/process-snapshot.ts`** – The shared reader this test protects; the only file expected to call the two `process.*` methods.
- **`src/infrastructure/observability/metrics-http.ts`** – Exempted as a prom-client Gauge that must read at scrape time.
- **`src/modules/observability/openapi.yaml`** – Parsed to extract `ProcessMemory`, `ObservabilityHealth`, and `ObservabilityMetricsSummary` schemas.
- **`src/modules/observability/asyncapi.yaml`** – Parsed to extract `ObservabilityMetricsPayload` (memory block and uptime) for cross-document comparison.

## Notes

- Property **order** is asserted, not just membership, because a human comparing the REST health card to the SSE live feed reads the two side by side; a reordering is a false lead.
- The gauge exemption in `metrics-http.ts` is deliberate: folding it into the shared reader would move the read to payload-composition time, which is wrong for a `collect()`-driven Gauge.
- The `at` helper returns `undefined` rather than throwing so that a renamed schema key produces a readable "expected defined" failure instead of a `TypeError` deep in a property chain.
- The test uses a simple substring match (`includes`) for the process-call scan; it will not distinguish commented-out calls from live ones.
