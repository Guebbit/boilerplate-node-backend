---
source: tests/cross-cutting/process-snapshot.test.ts
sha256: 22411d47886e42c0804639045cc21471d0d94d85626f2a8b77587decf4bfeb81
generated_at: 2026-09-23T19:58:39.059903+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/process-snapshot.test.ts

## Purpose

A cross-cutting guard that enforces two invariants for the process-observability surface: (1) `process.memoryUsage()` and `process.uptime()` may only be called from a small, explicitly allowlisted set of source files, and (2) the memory and uptime fields declared in `openapi.yaml` and `asyncapi.yaml` stay structurally identical. Without it, a fourth independent reader or a silent schema drift between the REST and SSE contracts would go undetected.

## Key elements

- **`ALLOWED_READERS`** – `Record<string, string>` mapping repo-relative source paths to a one-line justification. Only two entries: the shared reader (`process-snapshot.ts`) and the prom-client `Gauge` collector (`metrics-registry.ts`). Used by the "only place" test and the stale-allowlist test.
- **`listSourceFiles`** – Recursively walks `src/` and returns every `.ts` file path. Feeds the sweep and the offender scan.
- **`relativeToSource`** – Converts an absolute path to a forward-slashed, `src/`-relative string so allowlist keys are platform-stable.
- **`at`** – Safe key-path walker over a parsed YAML/JSON tree; returns `undefined` on a missing step rather than throwing, so a renamed schema surfaces as a readable assertion failure.
- **`propertyNames`** – Extracts `Object.keys(properties)` from a JSON-Schema node in declaration order.
- **Test: "sweeps a source tree that actually has files in it"** – Canary asserting the recursive listing returns >100 files, preventing a silently empty sweep from passing all other assertions.
- **Test: "is the only place … are read"** – Greps every source file for `process.memoryUsage(` / `process.uptime(` and asserts no file outside `ALLOWED_READERS` matches.
- **Test: "keeps every allowlisted reader real"** – Asserts every key in `ALLOWED_READERS` still corresponds to an existing file, so a renamed/deleted file cannot silently widen the rule.
- **Test: "publishes the same memory block …"** – Parses both `openapi.yaml` (`ProcessMemory`) and `asyncapi.yaml` (`ObservabilityMetricsPayload.properties.memory`), then asserts identical property name lists **and order** (`rss`, `heapUsed`, `heapTotal`, `external`), plus `additionalProperties: false` on both.
- **Test: "types every published uptime as a non-negative integer"** – Checks three schema locations (two in OpenAPI, one in AsyncAPI) declare `type: integer` and `minimum: 0`.

## Relationships

- Reads `src/modules/observability/services/process-snapshot.ts` and `src/infrastructure/observability/metrics-registry.ts` as string patterns (the allowlist entries); does not import them at runtime.
- Parses `src/modules/observability/openapi.yaml` and `src/modules/observability/asyncapi.yaml` via `yaml.parse` to compare schema blocks.
- No runtime interaction with `src/modules/account/tests/unit/two-factor.test.ts` despite the graph-neighbor listing.

## Notes

- The test is deliberately cross-cutting: it greps the entire `src/` tree by raw string match, so a rename of `process.uptime` to an alias or a re-import would still be caught (the string literal appears in the call).
- The canary test (`>100` files) exists because an empty `sourceFiles` array would make the offender filter pass vacuously.
- The `at` helper returns `undefined` rather than throwing; every caller is expected to assert `toBeDefined()`, which is why the tests read as readable expectation failures instead of mid-chain `TypeError`s.
- The gauge exemption is explicitly _not_ a candidate for folding into the shared reader: its `collect()` callback fires at Prometheus scrape time, a different instant from payload composition.
