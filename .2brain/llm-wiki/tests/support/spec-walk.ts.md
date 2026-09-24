---
source: tests/support/spec-walk.ts
sha256: d0281678b50c1b119a3afba76b7f78e0266448d021992c8845155d6d29a0d09e
generated_at: 2026-09-23T20:14:40.826937+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-walk.ts

## Purpose

Derives the list of HTTP operations and their request-body schemas from `openapi.yaml` so that the fuzz test suite always covers every declared endpoint without a hand-maintained list. It also provides tripwire checks (`unsupportedKeywords`, `ungeneratablePatterns`) that fail loudly when the spec grows a keyword or regex pattern the fuzzer cannot handle, preventing silent coverage gaps.

## Key elements

- **`readSpec()`** — Parses and caches `openapi.yaml` (single read across all test files).
- **`resolveSchema()`** — Resolves `$ref` and flattens `allOf` into a concrete `SchemaNode`; uses a `seen` set to guard against self-referential schemas (e.g. recursive categories).
- **`listOperations()`** — Walks `paths` × the five HTTP methods and returns an `Operation[]` with resolved body schema, path parameters, auth flag, and documented status codes.
- **`SUPPORTED_KEYWORDS`** — A `Set` of every JSON Schema keyword this walk recognises.
- **`unsupportedKeywords()`** — Returns sorted keys found in `components.schemas` that are *not* in `SUPPORTED_KEYWORDS`; empty array means the spec stays within the walk's vocabulary.
- **`ungeneratablePatterns()`** — Returns sorted `pattern` values that use lookaround and have no registered sample; the sibling tripwire for values the keyword set does cover.
- **`SchemaNode`** — The narrow interface for the JSON Schema subset this repo uses.
- **`Operation`** — The flat descriptor the fuzzer consumes (path, method, body schema, auth, multipart flag, statuses).
- **`HttpMethod`** — Union of the five verbs the walk enumerates.
- Internal helpers `childSchemasOf` and `visitSchemaNodes` perform the structural depth-first walk used by both tripwire checks.

## Relationships

- **`tests/support/pattern-samples.ts`** — Imported for `sampleForPattern` and `usesLookaround`; `ungeneratablePatterns` delegates to these to decide whether a regex is generatable.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Primary consumer: calls `listOperations`, `unsupportedKeywords`, and `ungeneratablePatterns` to drive fuzz runs and spec-vocabulary assertions.
- **`tests/support/spec-arbitraries.ts`** — Sibling module that consumes the `SchemaNode` / `resolveSchema` output to build `fast-check` arbitraries; together they form the "spec → arbitrary" pipeline.
- **`src/modules/audit-logs/service.ts`** (and other services) — Indirect: their routes are declared in `openapi.yaml`, which this file enumerates; no direct import.
- **`package.json`** — Supplies the `yaml` parser dependency used by `readSpec`.

## Notes

- **Deliberately bounded.** The header explicitly warns against growing this into a general OpenAPI parser. The tripwire functions exist so that the moment the spec uses an unrecognised keyword, a test goes red instead of the fuzzer silently skipping a field.
- **`childSchemasOf` is structural, not recursive over all keys.** An earlier version walked every object key and reported field *names* as "unknown keywords." The current implementation only descends into keys whose *value* is itself a schema (`properties` values, `items`, `additionalProperties`, `oneOf`/`anyOf`/`allOf` entries).
- **`resolveSchema` does not handle `discriminator`, `callbacks`, or `links`.** The header notes these are out of scope; the correct response is to adopt a dedicated OpenAPI tool.
- **Multipart operations are flagged, not generated.** `isMultipart` is `true` and the fuzzer skips them.
- **Cache is process-global.** `readSpec` stores the parsed document in a module-level `let`; tests sharing the same process get the same object.
