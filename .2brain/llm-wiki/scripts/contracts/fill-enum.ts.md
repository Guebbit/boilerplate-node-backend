---
source: scripts/contracts/fill-enum.ts
sha256: 271f9b651a06acea8a69794827be8db8fdefe4d8852d49d945908339e68638be
generated_at: 2026-11-08T02:40:50.363414+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/fill-enum.ts

## Purpose

Post-bundle step that resolves `x-enum-from` placeholders in an OpenAPI document by substituting the enum values from a named source list (e.g. channel names collected from every module's `asyncapi.webhooks.yaml`). It exists to avoid hand-copying values into contract fragments, which would drift the moment a module adds one.

## Key elements

- **`EnumSources`** (exported type) — `Readonly<Record<string, readonly string[]>>`; the named lists the bundler can fill from.
- **`withFilledEnums`** (exported function) — Entry point. Walks the whole `OpenApiDocument` in place, filling every `x-enum-from` node and returning nothing (mutation only).
- **`fillIn`** (internal) — Recursive depth-first walker over any parsed YAML node; detects `x-enum-from`, calls `enumFor`, then deletes `x-enum-from` / `x-enum-also` from the node.
- **`enumFor`** (internal) — Validates a single placeholder and computes the final value list (`written` + `own` + `also`). Throws descriptive errors for unknown sources, empty sources, malformed lists, or duplicate values.
- **`isOwnName`** (internal) — Guard that allows an unknown source name only when it matches the component schema's own name (the `x-extends` case from `openapi-extensions`).
- **`isStringList`** (internal) — Type-guard for `unknown` → `string[]`.

## Relationships

- **`openapi-document.ts`** — Provides the `OpenApiDocument` type used as the parameter type of `withFilledEnums`.
- **`openapi-bundle.ts`** — Caller. It assembles the `EnumSources` object (e.g. `"webhook-events": [...]`) and invokes `withFilledEnums` as one of the post-bundle steps. Adding a new source means adding one key in that caller; no change here.
- **`tests/unit/scripts/contracts/fill-enum.test.ts`** — Unit tests covering placeholder resolution, append semantics, error cases, and the `isOwnName` / `x-extends` path.

## Notes

- **Append, not replace.** If a schema already has a hand-written `enum`, the source's values are appended after it (and `x-enum-also` after those). This is the mechanism by which one module extends another's open enum via `x-extends`.
- **In-place mutation.** `withFilledEnums` mutates the passed document object; it does not return a new document.
- **Self-cleaning.** After filling, `x-enum-from` and `x-enum-also` are deleted so they never appear in the published contract.
- **No knowledge of specific sources.** This module is fully generic; it only reads the `sources` map it is handed. All domain-specific wiring lives in `openapi-bundle.ts`.
- **Empty-source guard.** A known source that resolves to `[]` is an error unless a hand-written `enum` already provides values.
