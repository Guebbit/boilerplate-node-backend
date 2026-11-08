---
source: tests/cross-cutting/process-snapshot.test.ts
sha256: 5c7ac8f41ee8b904c5bb56a4be80b4d4f849935b247a46265197e068b84ef796
generated_at: 2026-11-08T09:30:03.429141+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/process-snapshot.test.ts

## Purpose

Cross-cutting consistency test that pins the single source of truth for the process-snapshot shape across two documents that cannot cross-reference each other: `openapi.yaml` (REST) and `asyncapi.yaml` (SSE). Without this test, the four memory fields and the uptime type could drift independently in each YAML file with no compile-time or lint-time signal.

## Key elements

- **`at(root, ...keys)`** — Walks a parsed YAML document by a sequence of keys. Returns `undefined` (not a throw) when any intermediate node is missing or not a plain object, so failures surface as readable `expect(…).toBeDefined()` assertions rather than `TypeError` deep in a property chain.
- **`propertyNames(node)`** — Extracts the `Object.keys` of a JSON-Schema `properties` map in declaration order, or returns `[]` if the node is absent.
- **Test 1: "publishes the same memory block in openapi.yaml and asyncapi.yaml"** — Asserts that `ProcessMemory` (REST) and `ObservabilityMetricsPayload.properties.memory` (SSE) declare the exact same four fields (`rss`, `heapUsed`, `heapTotal`, `external`) in the same order, and both set `additionalProperties: false`.
- **Test 2: "types every published uptime as a non-negative integer"** — Asserts that all three `uptimeSeconds` declarations (two in openapi.yaml, one in asyncapi.yaml) have `type: "integer"` and `minimum: 0`.

## Relationships

- **`tests/support/paths.ts`** — Provides the `REPO_ROOT` constant used to resolve the absolute paths of `openapi.yaml` and `asyncapi.yaml` from any working directory.

## Notes

- The test reads the YAML files at test time (via `readFileSync` + `yaml` parser); it does not import the schema objects through any build artifact. A renamed key in either YAML file will cause the `at(…)` lookup to return `undefined`, which the explicit `toBeDefined()` assertions turn into a clear failure message.
- Field **order** is asserted, not just membership — the comments explain that a reader comparing the REST health card to the live SSE feed side-by-side would treat a reordered field list as a false lead.
- Both schemas are locked with `additionalProperties: false`, so adding a field to one document without updating the other is a hard test failure rather than a silent expansion.
